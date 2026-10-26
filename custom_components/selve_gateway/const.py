"""Konstanten der SELVE USB-RF Gateway Integration."""

DOMAIN = "selve_gateway"

# Hostname der App "selve_gateway": aus dem GitHub-Repository installiert
# (Kennung = sha1 der Repository-URL) bzw. lokal unter /addons abgelegt
DEFAULT_HOST = "d034fa46-selve-gateway"
KNOWN_HOSTS = (DEFAULT_HOST, "local-selve-gateway")
DEFAULT_PORT = 8765

SIGNAL_UPDATE = f"{DOMAIN}_update_{{}}"

# Bedienkommandos (Spezifikation Kap. 9.1.2)
CMD_STOP = 0
CMD_UP = 1
CMD_DOWN = 2
CMD_POS1 = 3
CMD_POS2 = 5
CMD_POS = 7
CMD_TYPE_MANUAL = 1
CMD_NAMES = {0: "Stopp", 1: "Auf", 2: "Ab", 3: "Pos 1", 4: "Pos 1 speichern", 5: "Pos 2", 6: "Pos 2 speichern", 7: "Position", 8: "Schritt auf", 9: "Schritt ab", 10: "Automatik ein", 11: "Automatik aus"}

# Aktortypen (Spezifikation Kap. 4.7)
TYPES = {
    0: "Unbekannt",
    1: "Rollladen",
    2: "Jalousie",
    3: "Markise",
    4: "Schaltaktor",
    5: "Dimmer",
    6: "Nachtlicht-Aktor",
    7: "Dämmerlicht-Aktor",
    8: "Heizung",
    9: "Kühlgerät",
    10: "Schaltaktor (Tagbetrieb)",
    11: "Gateway",
}
COVER_TYPES = {0, 1, 2, 3}

# Zustandsbits (Spezifikation Kap. 4.8)
FLAG_UNREACHABLE = 0
FLAGS = {
    0: "unreachable",
    1: "overload",
    2: "obstacle",
    3: "alarm",
    4: "sensor_lost",
    6: "gateway_unpaired",
    7: "wind_alarm",
    8: "rain_alarm",
    9: "frost_alarm",
}
FLAG_AUTOMATIC = 5
DAY_MODES = {0: None, 1: "night", 2: "dawn", 3: "day", 4: "dusk"}
