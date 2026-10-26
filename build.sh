#!/bin/sh
# Kopiert das Verwaltungstool (tool/) und die Integration (custom_components/)
# in den App-Ordner selve_gateway/, aus dem Home Assistant die App baut.
# Vor jedem Commit ausführen, wenn sich tool/ oder custom_components/ geändert hat.
set -e
cd "$(dirname "$0")"
APP=selve_gateway

rm -rf "$APP/app" "$APP/integration"
mkdir -p "$APP/app" "$APP/integration"
cp tool/selve_gateway.py tool/selve_gui.py "$APP/app/"
cp -r tool/web "$APP/app/web"
cp -r custom_components/selve_gateway "$APP/integration/selve_gateway"
find "$APP" -name __pycache__ -type d -exec rm -rf {} +
echo "App-Ordner $APP/ aktualisiert"
