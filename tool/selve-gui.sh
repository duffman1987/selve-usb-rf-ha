#!/bin/sh
# Startet das SELVE Gateway Verwaltungstool und öffnet es im Browser.
cd "$(dirname "$0")" && exec python3 selve_gui.py "$@"
