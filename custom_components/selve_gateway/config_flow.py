"""Einrichtungsdialog der SELVE USB-RF Gateway Integration."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DEFAULT_HOST, DEFAULT_PORT, DOMAIN
from .hub import CannotConnect, SelveError, SelveHub


class SelveConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            hub = SelveHub(self.hass, async_get_clientsession(self.hass), user_input[CONF_HOST], user_input[CONF_PORT], "setup")
            try:
                values = await hub.call("service.getVersion", timeout=15)
                status = await hub._session_status()  # noqa: SLF001
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except SelveError:
                errors["base"] = "no_stick"
            else:
                if not status.get("connected"):
                    errors["base"] = "no_stick"
                else:
                    serial = values[5]
                    await self.async_set_unique_id(serial)
                    self._abort_if_unique_id_configured(updates=user_input)
                    return self.async_create_entry(title=f"SELVE Gateway {serial}", data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=(user_input or {}).get(CONF_HOST, DEFAULT_HOST)): str,
                vol.Required(CONF_PORT, default=(user_input or {}).get(CONF_PORT, DEFAULT_PORT)): int,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
