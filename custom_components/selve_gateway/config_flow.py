"""Einrichtungsdialog der SELVE USB-RF Gateway Integration."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .const import DEFAULT_HOST, DEFAULT_PORT, DOMAIN, KNOWN_HOSTS
from .hub import CannotConnect, SelveError, SelveHub


class NoStick(SelveError):
    """App läuft, aber ohne USB-Stick."""


class SelveConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    _discovered: dict[str, Any]

    async def _async_get_serial(self, host: str, port: int) -> str:
        hub = SelveHub(self.hass, async_get_clientsession(self.hass), host, port, "setup")
        status = await hub._session_status()  # noqa: SLF001
        if not status.get("connected"):
            raise NoStick
        values = await hub.call("service.getVersion", timeout=15)
        return values[5]

    async def _async_try_hosts(self, host: str, port: int) -> tuple[str, str]:
        """Verbindet mit host; ist das ein Standardname der App, werden auch die anderen probiert."""
        hosts = [host] + [h for h in KNOWN_HOSTS if h != host] if host in KNOWN_HOSTS else [host]
        error: SelveError = CannotConnect()
        for candidate in hosts:
            try:
                return candidate, await self._async_get_serial(candidate, port)
            except CannotConnect as err:
                error = err
        raise error

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                host, serial = await self._async_try_hosts(user_input[CONF_HOST], user_input[CONF_PORT])
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except SelveError:
                errors["base"] = "no_stick"
            else:
                data = {CONF_HOST: host, CONF_PORT: user_input[CONF_PORT]}
                await self.async_set_unique_id(serial)
                self._abort_if_unique_id_configured(updates=data)
                return self.async_create_entry(title=f"SELVE Gateway {serial}", data=data)

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=(user_input or {}).get(CONF_HOST, DEFAULT_HOST)): str,
                vol.Required(CONF_PORT, default=(user_input or {}).get(CONF_PORT, DEFAULT_PORT)): int,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_hassio(self, discovery_info: HassioServiceInfo) -> ConfigFlowResult:
        """Die App hat sich über den Supervisor gemeldet."""
        config = discovery_info.config
        host = config.get(CONF_HOST) or discovery_info.slug.replace("_", "-")
        port = int(config.get(CONF_PORT, DEFAULT_PORT))
        self._discovered = {CONF_HOST: host, CONF_PORT: port}
        try:
            serial = await self._async_get_serial(host, port)
        except SelveError:
            # Stick evtl. noch nicht bereit – Seriennummer beim Bestätigen holen
            await self._async_handle_discovery_without_unique_id()
        else:
            await self.async_set_unique_id(serial)
            self._abort_if_unique_id_configured(updates=self._discovered)
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                serial = await self._async_get_serial(self._discovered[CONF_HOST], self._discovered[CONF_PORT])
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except SelveError:
                errors["base"] = "no_stick"
            else:
                await self.async_set_unique_id(serial)
                self._abort_if_unique_id_configured(updates=self._discovered)
                return self.async_create_entry(title=f"SELVE Gateway {serial}", data=self._discovered)
        return self.async_show_form(step_id="hassio_confirm", errors=errors)
