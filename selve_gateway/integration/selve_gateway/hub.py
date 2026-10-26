"""Verbindung zur SELVE Gateway App (HTTP-API + Ereignis-Stream)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import json
import logging
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import CMD_NAMES, SIGNAL_UPDATE

_LOGGER = logging.getLogger(__name__)

RECONNECT_DELAY = 10


class SelveError(Exception):
    """Fehler vom Gateway oder der App."""


class CannotConnect(SelveError):
    """App nicht erreichbar."""


@dataclass
class Device:
    id: int
    addr: int
    name: str
    type: int
    status: int = 0
    value: int = 0
    target: int = 0
    flags: int = 0
    day_mode: int = 0


@dataclass
class Group:
    id: int
    members: list[int]
    name: str


@dataclass
class IveoChannel:
    id: int
    name: str
    type: int


@dataclass
class GatewayInfo:
    serial: str
    firmware: str
    spec: str


def mask(ids: list[int], length: int = 8) -> dict[str, Any]:
    return {"mask": list(ids), "len": length}


class SelveHub:
    """Hält den Zustand des Gateways und verteilt Live-Ereignisse."""

    def __init__(self, hass: HomeAssistant, session: aiohttp.ClientSession, host: str, port: int, entry_id: str) -> None:
        self.hass = hass
        self._session = session
        self._base = f"http://{host}:{port}"
        self.signal = SIGNAL_UPDATE.format(entry_id)
        self.info: GatewayInfo | None = None
        self.devices: dict[int, Device] = {}
        self.groups: dict[int, Group] = {}
        self.iveo: dict[int, IveoChannel] = {}
        self.connected = False
        self._stop = asyncio.Event()

    # ---------- API ----------
    async def call(self, method: str, *params: Any, timeout: float = 45) -> list[Any]:
        if not method.startswith("selve."):
            method = "selve.GW." + method
        try:
            async with self._session.post(
                f"{self._base}/api/call",
                json={"method": method, "params": list(params)},
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as resp:
                data = await resp.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise CannotConnect(f"SELVE App nicht erreichbar: {err}") from err
        if not data.get("ok"):
            raise SelveError(data.get("error", "Unbekannter Fehler"))
        return data["values"]

    async def command_ok(self, method: str, *params: Any) -> None:
        values = await self.call(method, *params)
        if not values or values[0] != 1:
            raise SelveError(f"{method} wurde vom Gateway abgelehnt")

    # ---------- Laden ----------
    async def async_load(self) -> None:
        """Liest Gateway-Info, Aktore, Gruppen und iveo-Kanäle."""
        status = await self._session_status()
        if not status.get("connected"):
            raise CannotConnect("Die SELVE App ist nicht mit dem USB-Stick verbunden")
        v1, v2, v3, s1, s2, serial, rev = await self.call("service.getVersion")
        self.info = GatewayInfo(
            serial=serial,
            firmware=".".join(f"{x:02X}" for x in (v1, v2, v3, rev)),
            spec=f"{s1:x}.{s2:x}",
        )
        devices: dict[int, Device] = {}
        (ids,) = await self.call("device.getIDs")
        for i in ids["mask"]:
            _, addr, name, dtype, _slot = await self.call("device.getInfo", i)
            d = Device(i, addr, name, dtype)
            self._apply_values(d, (await self.call("device.getValues", i))[1:6])
            devices[i] = d
        self.devices = devices

        groups: dict[int, Group] = {}
        (ids,) = await self.call("group.getIDs")
        for i in ids["mask"]:
            _, members, name = await self.call("group.read", i)
            groups[i] = Group(i, members["mask"], name)
        self.groups = groups

        iveo: dict[int, IveoChannel] = {}
        (ids,) = await self.call("iveo.getIDs")
        for i in ids["mask"]:
            _, active, name, ctype = await self.call("iveo.getConfig", i)
            if active:
                iveo[i] = IveoChannel(i, name, ctype)
        self.iveo = iveo
        self.connected = True

    async def _session_status(self) -> dict[str, Any]:
        try:
            async with self._session.get(f"{self._base}/api/status", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                return await resp.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise CannotConnect(f"SELVE App nicht erreichbar: {err}") from err

    async def async_refresh_values(self) -> None:
        for d in list(self.devices.values()):
            try:
                self._apply_values(d, (await self.call("device.getValues", d.id))[1:6])
            except SelveError as err:
                _LOGGER.debug("Werte von Aktor %s nicht lesbar: %s", d.id, err)
        async_dispatcher_send(self.hass, self.signal)

    @staticmethod
    def _apply_values(d: Device, v: list[int]) -> None:
        d.status, d.value, d.target, d.flags, d.day_mode = v

    # ---------- Ereignis-Stream ----------
    async def async_listen(self) -> None:
        """Läuft dauerhaft im Hintergrund und verarbeitet Live-Ereignisse."""
        first = True
        while not self._stop.is_set():
            try:
                if not first:
                    await self.async_refresh_values()
                async with self._session.get(
                    f"{self._base}/api/stream",
                    timeout=aiohttp.ClientTimeout(total=None, sock_read=60),
                ) as resp:
                    self._set_connected(True)
                    async for raw in resp.content:
                        line = raw.decode("utf-8", "replace").strip()
                        if line.startswith("data: "):
                            self._handle(json.loads(line[6:]))
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001 – Verbindung immer wieder aufbauen
                _LOGGER.debug("Ereignis-Stream unterbrochen: %s", err)
            self._set_connected(False)
            first = False
            try:
                await asyncio.wait_for(self._stop.wait(), RECONNECT_DELAY)
            except asyncio.TimeoutError:
                pass

    def stop(self) -> None:
        self._stop.set()

    @callback
    def _set_connected(self, on: bool) -> None:
        if self.connected != on:
            self.connected = on
            if on:
                _LOGGER.info("Verbindung zur SELVE App hergestellt")
            else:
                _LOGGER.warning("Verbindung zur SELVE App unterbrochen")
            async_dispatcher_send(self.hass, self.signal)

    @callback
    def _handle(self, msg: dict[str, Any]) -> None:
        kind = msg.get("kind")
        if kind == "connection":
            # App hat den Stick verloren bzw. wiedergefunden
            on = bool(msg.get("connected"))
            if on and not self.connected:
                self.hass.async_create_task(self.async_refresh_values())
            self._set_connected(on)
            return
        if kind != "event":
            return
        method, v = msg.get("method"), msg.get("values", [])
        if method == "selve.GW.event.device":
            d = self.devices.get(v[0])
            if d is None:
                _LOGGER.info("Unbekannter Aktor %s meldet sich – Integration neu laden, um ihn hinzuzufügen", v[0])
                return
            self._apply_values(d, v[1:6])
            d.name = v[6] or d.name
            async_dispatcher_send(self.hass, self.signal)
        elif method == "selve.GW.event.log":
            _LOGGER.debug("Gateway-Log [%s] %s %s", v[1], v[4], v[3])
        elif method == "selve.GW.command.result" and v[4]["mask"]:
            names = ", ".join(self.devices[i].name if i in self.devices else str(i) for i in v[4]["mask"])
            _LOGGER.warning("SELVE Befehl „%s“ nicht ausgeführt bei: %s", CMD_NAMES.get(v[0], v[0]), names)
