"""Kommunikation mit dem SELVE USB-RF Gateway (SELVE XML Spezifikation Rev. 2.0.2).

Nur Python-Standardbibliothek: die serielle Schnittstelle wird direkt über
termios angesprochen (115200 Baud, 8N1, kein Handshake).
"""

import base64
import glob
import os
import queue
import re
import select
import termios
import threading
import time
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

BAUD = termios.B115200

# Methoden, deren Antwort länger dauern kann (Funkkommunikation mit Aktoren)
SLOW_METHODS = {
    "selve.GW.device.save": 40,
    "selve.GW.device.delete": 40,
    "selve.GW.device.writeManual": 40,
    "selve.GW.device.setLabel": 20,
    "selve.GW.device.setType": 20,
    "selve.GW.senSim.store": 40,
    "selve.GW.senSim.delete": 40,
    "selve.GW.service.factoryReset": 30,
}
DEFAULT_TIMEOUT = 8

_MSG_RE = re.compile(
    rb"<(methodResponse|methodCall)>.*?</\1>", re.DOTALL
)

ERROR_TEXTS = {
    1: "Unbekannter Fehler",
    2: "Methode wird nicht unterstützt",
    3: "Methode im aktuellen Zustand nicht erreichbar",
    4: "Falsche Anzahl Parameter",
    5: "Falsche Reihenfolge der Parameter",
    6: "Ausführung fehlgeschlagen",
    7: "Parameter außerhalb des Wertebereichs",
    8: "Syntaxfehler",
    9: "Telegramm zu lang",
    10: "ID wird nicht verwendet",
    11: "ID existiert bereits",
    12: "Adresse wird bereits verwendet",
    13: "Kein gültiges Mitglied vorhanden",
    14: "Duty Cycle erreicht – Senden blockiert",
    40: "Bootloader: Methode nicht unterstützt",
    41: "Bootloader: Falsche Datei",
    42: "Bootloader: Prüfsummenfehler",
    43: "Bootloader: Syntaxfehler",
}


class GatewayError(Exception):
    pass


class GatewayFault(GatewayError):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        text = ERROR_TEXTS.get(code, message)
        super().__init__(f"Fehler {code}: {text} ({message})")


class Mask:
    """Bitmaske für IDs (Byte 0.0 = ID 0 ... Byte n.7 = ID 8n+7)."""

    def __init__(self, data: bytes):
        self.data = data

    @classmethod
    def from_ids(cls, ids, length=8):
        buf = bytearray(length)
        for i in ids:
            i = int(i)
            if not 0 <= i < length * 8:
                raise ValueError(f"ID {i} außerhalb der Maske")
            buf[i // 8] |= 1 << (i % 8)
        return cls(bytes(buf))

    def ids(self):
        return [i for i in range(len(self.data) * 8) if self.data[i // 8] >> (i % 8) & 1]

    def b64(self):
        return base64.b64encode(self.data).decode("ascii")


def list_ports():
    ports = []
    for pattern in ("/dev/serial/by-id/*", "/dev/ttyUSB*", "/dev/ttyACM*"):
        for p in sorted(glob.glob(pattern)):
            real = os.path.realpath(p)
            if real not in [os.path.realpath(x["path"]) for x in ports]:
                ports.append({"path": p, "device": real})
    return ports


def build_call(method, params=()):
    parts = [f"<methodCall><methodName>{method}</methodName>"]
    if params:
        parts.append("<array>")
        for p in params:
            if isinstance(p, Mask):
                parts.append(f"<base64>{p.b64()}</base64>")
            elif isinstance(p, bool) or isinstance(p, int):
                parts.append(f"<int>{int(p)}</int>")
            elif isinstance(p, (bytes, bytearray)):
                parts.append(f"<base64>{base64.b64encode(p).decode()}</base64>")
            else:
                parts.append(f"<string>{escape(str(p))}</string>")
        parts.append("</array>")
    parts.append("</methodCall>")
    return "".join(parts).encode("utf-8")


def _parse_values(array_el):
    values = []
    if array_el is None:
        return values
    for el in array_el:
        text = el.text or ""
        if el.tag == "int":
            values.append(int(text.strip() or 0))
        elif el.tag == "string":
            values.append(text)
        elif el.tag == "base64":
            values.append(Mask(base64.b64decode(text.strip() or "")))
        else:
            values.append(text)
    return values


def parse_message(raw: bytes):
    """Gibt (art, methode, werte) zurück. art: 'response', 'fault', 'call'."""
    root = ET.fromstring(raw)
    if root.tag == "methodCall":
        name = (root.findtext("methodName") or "").strip()
        return "call", name, _parse_values(root.find("array"))
    fault = root.find("fault")
    if fault is not None:
        vals = _parse_values(fault.find("array"))
        msg = next((v for v in vals if isinstance(v, str)), "")
        code = next((v for v in vals if isinstance(v, int)), 1)
        return "fault", None, [msg, code]
    vals = _parse_values(root.find("array"))
    name = vals.pop(0) if vals and isinstance(vals[0], str) else None
    return "response", name, vals


class Gateway:
    def __init__(self):
        self.fd = None
        self.port = None
        self._reader = None
        self._stop = threading.Event()
        self._call_lock = threading.Lock()
        self._responses = queue.Queue()
        self._listeners = []
        self._write_lock = threading.Lock()

    # ---------- Ereignis-Listener ----------
    def add_listener(self, fn):
        """fn(kind, data): kind in 'event', 'traffic', 'connection'."""
        self._listeners.append(fn)

    def _emit(self, kind, data):
        for fn in list(self._listeners):
            try:
                fn(kind, data)
            except Exception:
                pass

    # ---------- Verbindung ----------
    @property
    def connected(self):
        return self.fd is not None

    def open(self, port):
        self.close()
        fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        try:
            attrs = termios.tcgetattr(fd)
            iflag, oflag, cflag, lflag, ispeed, ospeed, cc = attrs
            iflag = 0
            oflag = 0
            lflag = 0
            cflag = termios.CS8 | termios.CREAD | termios.CLOCAL
            cc[termios.VMIN] = 0
            cc[termios.VTIME] = 0
            termios.tcsetattr(fd, termios.TCSANOW, [iflag, oflag, cflag, lflag, BAUD, BAUD, cc])
            termios.tcflush(fd, termios.TCIOFLUSH)
        except Exception:
            os.close(fd)
            raise
        self.fd = fd
        self.port = port
        self._stop.clear()
        self._responses = queue.Queue()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        self._emit("connection", {"connected": True, "port": port})

    def close(self):
        if self.fd is None:
            return
        self._stop.set()
        if self._reader:
            self._reader.join(timeout=1)
        try:
            os.close(self.fd)
        except OSError:
            pass
        self.fd = None
        port, self.port = self.port, None
        self._emit("connection", {"connected": False, "port": port})

    def _read_loop(self):
        buf = b""
        fd = self.fd
        while not self._stop.is_set():
            try:
                r, _, _ = select.select([fd], [], [], 0.2)
                if not r:
                    continue
                chunk = os.read(fd, 4096)
            except OSError as e:
                self._emit("traffic", {"dir": "err", "text": f"Lesefehler: {e}"})
                self.fd = None
                self._emit("connection", {"connected": False, "port": self.port, "error": str(e)})
                return
            if not chunk:
                continue
            buf += chunk
            while True:
                m = _MSG_RE.search(buf)
                if not m:
                    # Ohne Endtag nicht unendlich puffern
                    if len(buf) > 16384:
                        buf = buf[-4096:]
                    break
                raw = m.group(0)
                buf = buf[m.end():]
                self._handle_raw(raw)

    def _handle_raw(self, raw):
        text = raw.decode("utf-8", "replace")
        self._emit("traffic", {"dir": "rx", "text": text})
        try:
            kind, name, values = parse_message(raw)
        except ET.ParseError as e:
            self._emit("traffic", {"dir": "err", "text": f"XML nicht lesbar: {e}"})
            return
        if kind == "call":
            self._emit("event", {"method": name, "values": values})
        else:
            self._responses.put((kind, name, values))

    # ---------- Methodenaufruf ----------
    def call(self, method, params=(), timeout=None):
        if self.fd is None:
            raise GatewayError("Nicht mit dem Gateway verbunden")
        if timeout is None:
            timeout = SLOW_METHODS.get(method, DEFAULT_TIMEOUT)
        data = build_call(method, params)
        if len(data) > 512:
            raise GatewayError("Telegramm überschreitet 512 Byte")
        with self._call_lock:
            # verspätete Antworten früherer Aufrufe verwerfen
            while not self._responses.empty():
                self._responses.get_nowait()
            with self._write_lock:
                os.write(self.fd, data)
            self._emit("traffic", {"dir": "tx", "text": data.decode("utf-8")})
            deadline = time.monotonic() + timeout
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    raise GatewayError(f"Keine Antwort auf {method} (Timeout {timeout}s)")
                try:
                    kind, name, values = self._responses.get(timeout=left)
                except queue.Empty:
                    continue
                if kind == "fault":
                    raise GatewayFault(values[1], values[0])
                if name is not None and name != method:
                    # Antwort gehört nicht zu diesem Aufruf
                    continue
                return values

    def ping(self, timeout=2):
        self.call("selve.GW.service.ping", timeout=timeout)
        return True


def find_gateway(gw: Gateway):
    """Probiert alle seriellen Ports per Ping durch."""
    for p in list_ports():
        try:
            gw.open(p["device"])
            gw.ping()
            return p["device"]
        except Exception:
            gw.close()
    return None
