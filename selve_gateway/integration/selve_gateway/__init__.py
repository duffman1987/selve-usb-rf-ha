"""SELVE USB-RF Gateway Integration.

Die Rollläden werden über die Home Assistant App "SELVE USB-RF Gateway"
angesprochen, die den USB-Stick verwaltet.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PORT, Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN
from .hub import SelveError, SelveHub

PLATFORMS = [Platform.COVER]

type SelveConfigEntry = ConfigEntry[SelveHub]


async def async_setup_entry(hass: HomeAssistant, entry: SelveConfigEntry) -> bool:
    hub = SelveHub(hass, async_get_clientsession(hass), entry.data[CONF_HOST], entry.data[CONF_PORT], entry.entry_id)
    try:
        await hub.async_load()
    except SelveError as err:
        raise ConfigEntryNotReady(str(err)) from err

    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, hub.info.serial)},
        manufacturer="SELVE",
        model="USB-RF Gateway",
        name="SELVE USB-RF Gateway",
        serial_number=hub.info.serial,
        sw_version=hub.info.firmware,
    )

    entry.runtime_data = hub
    entry.async_on_unload(hub.stop)
    entry.async_create_background_task(hass, hub.async_listen(), "selve_gateway_events")
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: SelveConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
