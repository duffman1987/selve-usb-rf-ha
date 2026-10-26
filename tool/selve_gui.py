#!/usr/bin/env python3
"""Grafisches Verwaltungstool für das SELVE USB-RF Gateway.

Startet einen lokalen Webserver (nur 127.0.0.1) und öffnet die Oberfläche
im Browser. Aufruf:  python3 selve_gui.py [--port 8765] [--device /dev/ttyUSB0] [--no-browser]
"""

import argparse
import json
import mimetypes
import os
import queue
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from selve_gateway import Gateway, GatewayError, GatewayFault, Mask, find_gateway, list_ports

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

gateway = Gateway()
_clients = []
_clients_lock = threading.Lock()


def to_json_value(v):
    if isinstance(v, Mask):
        return {"mask": v.ids(), "b64": v.b64(), "len": len(v.data)}
    return v


def from_json_param(p):
    """Parameter aus dem Browser: Zahl, Text oder {"mask": [ids], "len": n}."""
    if isinstance(p, dict) and "mask" in p:
        return Mask.from_ids(p["mask"], int(p.get("len", 8)))
    if isinstance(p, bool):
        return int(p)
    if isinstance(p, (int, str)):
        return p
    if isinstance(p, float):
        return int(p)
    raise ValueError(f"Ungültiger Parameter: {p!r}")


def broadcast(kind, data):
    if kind == "event":
        data = {"method": data["method"], "values": [to_json_value(v) for v in data["values"]]}
    msg = json.dumps({"kind": kind, **data})
    with _clients_lock:
        for q in list(_clients):
            try:
                q.put_nowait(msg)
            except queue.Full:
                pass


gateway.add_listener(broadcast)


class Handler(BaseHTTPRequestHandler):
    server_version = "SelveGUI/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def _check_origin(self):
        # Nur Anfragen von der eigenen Oberfläche zulassen
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        # Home Assistant Ingress: Der Supervisor ist der Proxy und hat die
        # Anmeldung bereits geprüft; Origin ist dann die HA-Adresse.
        if self.headers.get("X-Ingress-Path"):
            return True
        if origin and origin.split("://", 1)[-1] != host:
            self._json({"ok": False, "error": "Fremder Ursprung abgelehnt"}, 403)
            return False
        return True

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/status":
            return self._json({"connected": gateway.connected, "port": gateway.port})
        if path == "/api/ports":
            return self._json({"ports": list_ports()})
        if path == "/api/stream":
            return self._stream()
        if path == "/":
            path = "/index.html"
        file = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not file.startswith(WEB_DIR) or not os.path.isfile(file):
            self.send_error(404)
            return
        with open(file, "rb") as f:
            data = f.read()
        self.send_response(200)
        ctype = mimetypes.guess_type(file)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _stream(self):
        q = queue.Queue(maxsize=1000)
        with _clients_lock:
            _clients.append(q)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(b": ok\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15)
                    self.wfile.write(f"data: {msg}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with _clients_lock:
                if q in _clients:
                    _clients.remove(q)

    def do_POST(self):
        if not self._check_origin():
            return
        path = self.path.split("?", 1)[0]
        try:
            body = self._body()
        except Exception:
            return self._json({"ok": False, "error": "Ungültige Anfrage"}, 400)
        try:
            if path == "/api/connect":
                port = body.get("port") or "auto"
                if port == "auto":
                    found = find_gateway(gateway)
                    if not found:
                        return self._json({"ok": False, "error": "Kein Gateway an den seriellen Ports gefunden"})
                else:
                    gateway.open(port)
                    gateway.ping()
                return self._json({"ok": True, "port": gateway.port})
            if path == "/api/disconnect":
                gateway.close()
                return self._json({"ok": True})
            if path == "/api/call":
                method = body["method"]
                if not method.startswith("selve.GW."):
                    return self._json({"ok": False, "error": "Nur selve.GW.* Methoden erlaubt"}, 400)
                params = [from_json_param(p) for p in body.get("params", [])]
                values = gateway.call(method, params, timeout=body.get("timeout"))
                return self._json({"ok": True, "values": [to_json_value(v) for v in values]})
        except GatewayFault as e:
            return self._json({"ok": False, "error": str(e), "code": e.code})
        except (GatewayError, OSError, ValueError, KeyError) as e:
            return self._json({"ok": False, "error": str(e)})
        self.send_error(404)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=8765, help="HTTP-Port der Oberfläche")
    ap.add_argument("--host", default="127.0.0.1", help="Adresse, an der der Server lauscht (Home Assistant App: 0.0.0.0)")
    ap.add_argument("--device", default="auto", help="Serieller Port des Sticks (Standard: automatisch)")
    ap.add_argument("--no-browser", action="store_true", help="Browser nicht automatisch öffnen")
    args = ap.parse_args()

    try:
        if args.device == "auto":
            found = find_gateway(gateway)
            print(f"Gateway gefunden an {found}" if found else "Kein Gateway gefunden – Verbindung in der Oberfläche herstellen.")
        else:
            gateway.open(args.device)
            gateway.ping()
            print(f"Verbunden mit {args.device}")
    except Exception as e:
        gateway.close()
        print(f"Verbindung fehlgeschlagen: {e}")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Oberfläche: {url}  (Beenden mit Strg+C)")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        gateway.close()


if __name__ == "__main__":
    main()
