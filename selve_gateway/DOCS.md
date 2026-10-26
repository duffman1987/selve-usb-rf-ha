# SELVE USB-RF Gateway

Diese App verbindet Home Assistant mit dem SELVE USB-RF Stick (Art.-Nr. 297792)
und steuert damit commeo- und iveo-Rollläden, Jalousien und Markisen.

## Was die App macht

- **Verwaltungsoberfläche** in der Seitenleiste („SELVE“): Aktore suchen und einlernen,
  umbenennen, Gruppen, iveo-Kanäle, Sensoren, Handsender, Sensorsimulation,
  Endlagen, Neu-Einlernen, Gateway-Einstellungen, Protokoll.
- **Schnittstelle für die Integration** „SELVE USB-RF Gateway“, mit der alle Rollläden,
  Gruppen und iveo-Kanäle als Geräte (`cover`) in Home Assistant erscheinen.

## Einrichtung

1. App starten. Im **Protokoll** sollte „Gateway gefunden an /dev/ttyUSB0“ stehen.
2. Integration über **HACS** installieren (benutzerdefiniertes Repository
   `https://github.com/duffman1987/selve-usb-rf-ha`, Typ *Integration*) und
   Home Assistant neu starten.
3. **Einstellungen → Geräte & Dienste → Integration hinzufügen → „SELVE USB-RF Gateway“**.
   Host `local-selve-gateway` und Port `8765` übernehmen.

## Optionen

- **USB-Stick**: Leer lassen – die App sucht den Stick selbst. Bei mehreren
  USB-Seriell-Geräten hier den richtigen Port auswählen.
- **Integration installieren**: Nur für Installationen **ohne HACS** einschalten.
  Die App kopiert dann die Integration beim Start nach
  `/config/custom_components/selve_gateway`. Mit HACS ausgeschaltet lassen,
  sonst überschreiben sich beide gegenseitig.

## Hinweise

- Neu eingelernte Aktore oder Gruppen erscheinen in Home Assistant nach
  **Integration neu laden** (Geräte & Dienste → SELVE → ⋮ → Neu laden).
- Nicht erreichbare Aktore werden als „nicht verfügbar“ angezeigt.
- iveo ist einseitig: Home Assistant kennt die Position dieser Rollläden nicht.
- Die Schnittstelle der App (Port 8765) ist nur im internen Home-Assistant-Netz
  erreichbar und wird nicht nach außen freigegeben.
