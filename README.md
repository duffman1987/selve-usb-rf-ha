# SELVE USB-RF Gateway für Home Assistant

Steuert SELVE **commeo**- und **iveo**-Rollläden, -Jalousien und -Markisen über den
**SELVE USB-RF Stick** (Art.-Nr. 297792) in Home Assistant.

Das Repository enthält zwei Teile, die zusammenarbeiten:

| Teil | Aufgabe | Installation |
|---|---|---|
| **App** `selve_gateway` | Spricht mit dem USB-Stick, Verwaltungsoberfläche in der Seitenleiste (Aktore suchen/einlernen, Gruppen, iveo-Kanäle, Sensoren, Handsender, Endlagen, Protokoll …) | App-Store von Home Assistant |
| **Integration** `selve_gateway` | Rollläden, Gruppen und iveo-Kanäle als Geräte (`cover`) – live, für Dashboards, Sprachassistenten und Automationen | HACS |

Voraussetzung: **Home Assistant OS** (für die App), der Stick steckt am Home-Assistant-Rechner.

## Installation

### 1. App installieren

[![App-Repository hinzufügen](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fduffman1987%2Fselve-usb-rf-ha)

Oder von Hand: *Einstellungen → Apps → App-Store → ⋮ → Repositories* →
`https://github.com/duffman1987/selve-usb-rf-ha` hinzufügen.

Danach „**SELVE USB-RF Gateway**“ im App-Store öffnen → **Installieren**
(das Bauen dauert beim ersten Mal 1–3 Minuten) → optional „In Seitenleiste anzeigen“ → **Starten**.
Im Reiter *Protokoll* sollte „Gateway gefunden an /dev/ttyUSB0“ stehen.

### 2. Integration über HACS installieren

[![In HACS öffnen](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=duffman1987&repository=selve-usb-rf-ha&category=integration)

Oder von Hand: *HACS → ⋮ → Benutzerdefinierte Repositories* →
`https://github.com/duffman1987/selve-usb-rf-ha`, Typ **Integration** → Hinzufügen.
Dann „SELVE USB-RF Gateway“ in HACS suchen → **Herunterladen** → **Home Assistant neu starten**.

### 3. Integration einrichten

[![Integration hinzufügen](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=selve_gateway)

*Einstellungen → Geräte & Dienste → Integration hinzufügen* → „SELVE USB-RF Gateway“ →
Host `local-selve-gateway` und Port `8765` übernehmen.

## Nutzung

- Jeder commeo-Aktor wird ein Gerät mit einer `cover`-Entität (z.B. `cover.bar`):
  öffnen, schließen, stoppen, Position setzen. Position und Fahrtrichtung kommen live.
- Gateway-Gruppen erscheinen als `cover.gruppe_<name>`, iveo-Kanäle als eigene Geräte
  (ohne Positionsrückmeldung).
- Aktion `selve_gateway.drive_intermediate_position` mit `position: 1` (Beschattung)
  oder `2` (Lüftung):

  ```yaml
  action: selve_gateway.drive_intermediate_position
  target:
    entity_id: cover.wohnzimmer
  data:
    position: 1
  ```

- Nicht erreichbare Aktore werden als „nicht verfügbar“ angezeigt; die Attribute
  `warnings`, `automatic` und `day_mode` zeigen Details.
- Neu eingelernte Aktore/Gruppen erscheinen nach *Integration neu laden*.

## Updates

Neue Versionen erscheinen als Update im App-Store bzw. in HACS.

## Ohne Home Assistant

`tool/` enthält dieselbe Verwaltungsoberfläche als eigenständiges Programm für einen
Linux-PC (nur Python 3 nötig): `tool/selve-gui.sh` – siehe [tool/README.md](tool/README.md).

## Entwicklung

`tool/` und `custom_components/` sind die Quellen. `./build.sh` kopiert sie in den
App-Ordner `selve_gateway/` – vor jedem Commit ausführen. Bei einer neuen Version
`version` in `selve_gateway/config.yaml` **und** `custom_components/selve_gateway/manifest.json`
erhöhen und einen GitHub-Release mit Tag `vX.Y.Z` anlegen.

## Hinweis

Kein offizielles Produkt der SELVE GmbH & Co. KG. Grundlage ist die öffentliche
„SELVE XML Spezifikation“ (Rev. 2.0.2) des USB-RF Gateways.
