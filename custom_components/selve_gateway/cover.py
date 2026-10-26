"""Rollläden, Gruppen und iveo-Kanäle als Cover-Entitäten."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.cover import (
    ATTR_POSITION,
    CoverDeviceClass,
    CoverEntity,
    CoverEntityFeature,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_platform
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import SelveConfigEntry
from .const import (
    CMD_DOWN,
    CMD_POS,
    CMD_POS1,
    CMD_POS2,
    CMD_STOP,
    CMD_TYPE_MANUAL,
    CMD_UP,
    COVER_TYPES,
    DAY_MODES,
    DOMAIN,
    FLAG_AUTOMATIC,
    FLAG_UNREACHABLE,
    FLAGS,
    TYPES,
)
from .hub import Device, Group, IveoChannel, SelveError, SelveHub, mask

DEVICE_CLASS = {1: CoverDeviceClass.SHUTTER, 2: CoverDeviceClass.BLIND, 3: CoverDeviceClass.AWNING}
IVEO_CMD = {CMD_STOP: 0, CMD_UP: 1, CMD_DOWN: 2, CMD_POS1: 3, CMD_POS2: 4}

SERVICE_DRIVE_INTERMEDIATE = "drive_intermediate_position"


def ha_position(value: int) -> int:
    """SELVE: 0 = oben/offen … 65535 = unten/zu. HA: 100 = offen, 0 = zu."""
    return 100 - round(value * 100 / 65535)


def selve_value(position: int) -> int:
    return round((100 - position) * 65535 / 100)


async def async_setup_entry(hass: HomeAssistant, entry: SelveConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    hub = entry.runtime_data
    entities: list[CoverEntity] = [SelveDeviceCover(hub, d) for d in hub.devices.values() if d.type in COVER_TYPES]
    entities += [SelveGroupCover(hub, g) for g in hub.groups.values()]
    entities += [SelveIveoCover(hub, c) for c in hub.iveo.values()]
    async_add_entities(entities)

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        SERVICE_DRIVE_INTERMEDIATE,
        {vol.Required("position"): vol.All(vol.Coerce(int), vol.In([1, 2]))},
        "async_drive_intermediate",
    )


class SelveBaseCover(CoverEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hub: SelveHub) -> None:
        self.hub = hub

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, self.hub.signal, self._update))

    @callback
    def _update(self) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self.hub.connected

    async def _send(self, method: str, *params: Any) -> None:
        try:
            await self.hub.command_ok(method, *params)
        except SelveError as err:
            raise HomeAssistantError(f"SELVE: {err}") from err

    async def _command(self, cmd: int, param: int = 0) -> None:
        raise NotImplementedError

    async def async_open_cover(self, **kwargs: Any) -> None:
        await self._command(CMD_UP)

    async def async_close_cover(self, **kwargs: Any) -> None:
        await self._command(CMD_DOWN)

    async def async_stop_cover(self, **kwargs: Any) -> None:
        await self._command(CMD_STOP)

    async def async_drive_intermediate(self, position: int) -> None:
        await self._command(CMD_POS1 if position == 1 else CMD_POS2)


class SelveDeviceCover(SelveBaseCover):
    """Ein commeo-Aktor (Rollladen, Jalousie, Markise)."""

    _attr_name = None
    _attr_supported_features = (
        CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE | CoverEntityFeature.STOP | CoverEntityFeature.SET_POSITION
    )

    def __init__(self, hub: SelveHub, device: Device) -> None:
        super().__init__(hub)
        self.device = device
        serial = hub.info.serial
        self._attr_unique_id = f"{serial}_commeo_{device.addr:06x}"
        self._attr_device_class = DEVICE_CLASS.get(device.type, CoverDeviceClass.SHUTTER)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{serial}_commeo_{device.addr:06x}")},
            name=device.name,
            manufacturer="SELVE",
            model=f"commeo {TYPES.get(device.type, 'Aktor')}",
            via_device=(DOMAIN, serial),
        )

    @property
    def available(self) -> bool:
        return self.hub.connected and not (self.device.flags >> FLAG_UNREACHABLE & 1)

    @property
    def current_cover_position(self) -> int:
        return ha_position(self.device.value)

    @property
    def is_closed(self) -> bool:
        return self.current_cover_position == 0

    @property
    def is_opening(self) -> bool:
        return self.device.status == 2

    @property
    def is_closing(self) -> bool:
        return self.device.status == 3

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        f = self.device.flags
        return {
            "actuator_id": self.device.id,
            "radio_address": f"0x{self.device.addr:06X}",
            "automatic": bool(f >> FLAG_AUTOMATIC & 1),
            "day_mode": DAY_MODES.get(self.device.day_mode),
            "warnings": [name for bit, name in FLAGS.items() if f >> bit & 1],
        }

    async def _command(self, cmd: int, param: int = 0) -> None:
        await self._send("command.device", self.device.id, cmd, CMD_TYPE_MANUAL, param)

    async def async_set_cover_position(self, **kwargs: Any) -> None:
        await self._command(CMD_POS, selve_value(kwargs[ATTR_POSITION]))


class SelveGroupCover(SelveBaseCover):
    """Eine im Gateway gespeicherte Gruppe."""

    _attr_supported_features = (
        CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE | CoverEntityFeature.STOP | CoverEntityFeature.SET_POSITION
    )
    _attr_device_class = CoverDeviceClass.SHUTTER
    _attr_icon = "mdi:window-shutter-settings"

    def __init__(self, hub: SelveHub, group: Group) -> None:
        super().__init__(hub)
        self.group = group
        serial = hub.info.serial
        self._attr_unique_id = f"{serial}_group_{group.id}"
        self._attr_name = None
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{serial}_group_{group.id}")},
            name=f"Gruppe {group.name}" if group.name else f"Gruppe {group.id}",
            manufacturer="SELVE",
            model="commeo Gruppe",
            via_device=(DOMAIN, serial),
        )

    def _members(self) -> list[Device]:
        return [self.hub.devices[i] for i in self.group.members if i in self.hub.devices]

    @property
    def current_cover_position(self) -> int | None:
        members = [d for d in self._members() if not d.flags >> FLAG_UNREACHABLE & 1]
        if not members:
            return None
        return round(sum(ha_position(d.value) for d in members) / len(members))

    @property
    def is_closed(self) -> bool | None:
        pos = self.current_cover_position
        return None if pos is None else pos == 0

    @property
    def is_opening(self) -> bool:
        return any(d.status == 2 for d in self._members())

    @property
    def is_closing(self) -> bool:
        return any(d.status == 3 for d in self._members())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"group_id": self.group.id, "members": [d.name for d in self._members()]}

    async def _command(self, cmd: int, param: int = 0) -> None:
        await self._send("command.group", self.group.id, cmd, CMD_TYPE_MANUAL, param)

    async def async_set_cover_position(self, **kwargs: Any) -> None:
        await self._command(CMD_POS, selve_value(kwargs[ATTR_POSITION]))


class SelveIveoCover(SelveBaseCover):
    """Ein iveo-Funkkanal (nur senden, keine Rückmeldung)."""

    _attr_assumed_state = True
    _attr_name = None
    _attr_supported_features = CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE | CoverEntityFeature.STOP

    def __init__(self, hub: SelveHub, channel: IveoChannel) -> None:
        super().__init__(hub)
        self.channel = channel
        serial = hub.info.serial
        self._attr_unique_id = f"{serial}_iveo_{channel.id}"
        self._attr_device_class = DEVICE_CLASS.get(channel.type, CoverDeviceClass.SHUTTER)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{serial}_iveo_{channel.id}")},
            name=channel.name or f"iveo {channel.id}",
            manufacturer="SELVE",
            model=f"iveo {TYPES.get(channel.type, 'Kanal')}",
            via_device=(DOMAIN, serial),
        )

    @property
    def is_closed(self) -> None:
        return None

    async def _command(self, cmd: int, param: int = 0) -> None:
        await self._send("iveo.commandManual", mask([self.channel.id]), IVEO_CMD[cmd])
