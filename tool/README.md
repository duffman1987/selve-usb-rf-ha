# SELVE USB-RF Gateway – Verwaltungstool

Grafische Oberfläche für das SELVE USB-RF Gateway (Art.-Nr. 297792) nach der
„SELVE XML Spezifikation Rev. 2.0.2“. Benötigt nur Python 3 – keine
zusätzlichen Pakete.

## Starten

```bash
./selve-gui.sh
```

Der Stick wird automatisch gesucht, die Oberfläche öffnet sich unter
http://127.0.0.1:8765/. Optionen: `--device /dev/ttyUSB0`, `--port 8765`,
`--no-browser`. Der Benutzer muss in der Gruppe `dialout` sein.

## Funktionen

- **Aktore (commeo):** Position und Status live, Auf/Stopp/Ab, Zwischenpositionen,
  Zielposition per Schieberegler, Mehrfachauswahl, Name/Typ ändern, Automatik,
  Lamellenschritte, Suchen und Einlernen neuer Aktore, Löschen,
  Endlagen-Assistent (Totmannbetrieb).
- **Gruppen:** anlegen, Mitglieder wählen, umbenennen, löschen, bedienen.
- **iveo-Kanäle:** anlegen, ein-/auslernen, Lernbereitschaft, bedienen, Repeater.
- **Sensoren / Handsender:** Einlern-Assistent mit Countdown, Werte bzw. Tastendrücke live,
  umbenennen, löschen.
- **Sensorsimulation:** Werte setzen, in Aktore ein-/auslernen, Testmodus.
- **Gateway:** Version, Funkdaten, LED, Weiterleitung, Ereignisse, Neustart,
  Werkszustand, Sicherung als JSON exportieren.
- **Protokoll:** Ereignisse und Gateway-Logs live, optional Roh-XML,
  Konsole für beliebige `selve.GW.*`-Methoden.

Nicht enthalten: Firmware-Update des Sticks.

## Home Assistant

Für Home Assistant gibt es eine App und eine Integration – siehe [README im Hauptverzeichnis](../README.md).

## Dateien

- `selve_gateway.py` – serielle Kommunikation und XML-Protokoll
- `selve_gui.py` – lokaler Webserver (nur 127.0.0.1)
- `web/` – Oberfläche
