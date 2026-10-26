#!/usr/bin/with-contenv bashio
# Startet das SELVE Gateway Verwaltungstool als Home Assistant App.

DEVICE="$(bashio::config 'device')"
if bashio::var.is_empty "${DEVICE}"; then
    DEVICE="auto"
fi

# Integration in /config/custom_components installieren bzw. aktualisieren
if bashio::config.true 'install_integration'; then
    TARGET=/homeassistant/custom_components/selve_gateway
    NEW_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' /integration/selve_gateway/manifest.json)"
    OLD_VERSION=""
    if [ -f "${TARGET}/manifest.json" ]; then
        OLD_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${TARGET}/manifest.json")"
    fi
    if [ "${NEW_VERSION}" != "${OLD_VERSION}" ]; then
        mkdir -p /homeassistant/custom_components
        rm -rf "${TARGET}"
        cp -r /integration/selve_gateway "${TARGET}"
        bashio::log.warning "Integration 'SELVE USB-RF Gateway' ${NEW_VERSION} installiert – bitte Home Assistant neu starten."
    else
        bashio::log.info "Integration ${OLD_VERSION} ist aktuell."
    fi
fi

# Bei Home Assistant melden, damit die Integration die App automatisch findet
HOST="$(hostname)"
if bashio::discovery "selve_gateway" "$(bashio::var.json host "${HOST}" port "^8765")" > /dev/null; then
    bashio::log.info "Bei Home Assistant als ${HOST}:8765 gemeldet."
else
    bashio::log.warning "Meldung bei Home Assistant fehlgeschlagen – Integration bitte von Hand mit Host ${HOST} einrichten."
fi

bashio::log.info "Starte SELVE Gateway (Port: ${DEVICE})"
exec python3 /app/selve_gui.py --host 0.0.0.0 --port 8765 --no-browser --device "${DEVICE}"
