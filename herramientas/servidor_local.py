"""Servidor local para probar la app en esta PC (lo usa "Abrir app.bat").

Igual que `python -m http.server`, pero le pide al navegador que no guarde copias viejas,
para que siempre veas la última versión de la app al recargar.
"""
import http.server
import os
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


http.server.ThreadingHTTPServer(("127.0.0.1", PUERTO), SinCache).serve_forever()
