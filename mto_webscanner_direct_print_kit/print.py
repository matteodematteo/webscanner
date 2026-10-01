import ctypes
import json
import time
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, HTTPServer

# ---------------------------
# USER VARIABLES
# ---------------------------
PORT = 5000
PRINTER_40X25_NAME = "Zebra GC420d - EPL (副本 1)" # Change this to your exact printer name
PRINTER_60X38_NAME = "Zebra GC420d - EPL" # Change this to your exact printer name
SHOW_TERMINAL_MESSAGES = True

def emit_status(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    if SHOW_TERMINAL_MESSAGES:
        print(f"[{timestamp}] {message}", flush=True)

def detect_label_size(name: str) -> str:
    lower = name.lower()
    if "40_25" in lower or "sticker" in lower:
        return "40x25"
    if "60_38" in lower or "big" in lower:
        return "60x38"
    return "40x25"

def select_printer(label_size: str) -> str:
    if label_size == "40x25":
        return PRINTER_40X25_NAME
    if label_size == "60x38":
        return PRINTER_60X38_NAME
    raise ValueError(f"Unsupported label size: {label_size}")

# -------------------------------------------------------------------------
# WINDOWS PRINTER API
# -------------------------------------------------------------------------

winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)

class DOCINFO1(ctypes.Structure):
    _fields_ = [
        ("pDocName", wintypes.LPWSTR),
        ("pOutputFile", wintypes.LPWSTR),
        ("pDatatype", wintypes.LPWSTR),
    ]

OpenPrinter = winspool.OpenPrinterW
OpenPrinter.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), wintypes.LPVOID]
OpenPrinter.restype = wintypes.BOOL

ClosePrinter = winspool.ClosePrinter
ClosePrinter.argtypes = [wintypes.HANDLE]
ClosePrinter.restype = wintypes.BOOL

StartDocPrinter = winspool.StartDocPrinterW
StartDocPrinter.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPBYTE]
StartDocPrinter.restype = wintypes.DWORD

EndDocPrinter = winspool.EndDocPrinter
EndDocPrinter.argtypes = [wintypes.HANDLE]
EndDocPrinter.restype = wintypes.BOOL

StartPagePrinter = winspool.StartPagePrinter
StartPagePrinter.argtypes = [wintypes.HANDLE]
StartPagePrinter.restype = wintypes.BOOL

EndPagePrinter = winspool.EndPagePrinter
EndPagePrinter.argtypes = [wintypes.HANDLE]
EndPagePrinter.restype = wintypes.BOOL

WritePrinter = winspool.WritePrinter
WritePrinter.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
WritePrinter.restype = wintypes.BOOL

def send_raw_to_printer(printer_name: str, raw_data: str, document_name: str) -> None:
    handle = wintypes.HANDLE()
    if not OpenPrinter(printer_name, ctypes.byref(handle), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        doc_info = DOCINFO1(document_name, None, "RAW")
        if not StartDocPrinter(handle, 1, ctypes.cast(ctypes.byref(doc_info), wintypes.LPBYTE)):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            if not StartPagePrinter(handle):
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                payload = raw_data.encode("utf-8")
                written = wintypes.DWORD(0)
                if not WritePrinter(handle, payload, len(payload), ctypes.byref(written)):
                    raise ctypes.WinError(ctypes.get_last_error())
            finally:
                EndPagePrinter(handle)
        finally:
            EndDocPrinter(handle)
    finally:
        ClosePrinter(handle)

# -------------------------------------------------------------------------
# HTTP SERVER (Listens for Ngrok)
# -------------------------------------------------------------------------

class DirectPrintHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            data = json.loads(body)
            filename = data.get("filename", "direct_print_job")
            label_size = data.get("label_size") or detect_label_size(filename)
            zpl = data.get("zpl", "")

            if not zpl.strip():
                raise ValueError("Payload missing 'zpl' string.")

            printer_name = select_printer(label_size)
            emit_status(f"Direct Print Request Received: {filename} ({label_size})")

            send_raw_to_printer(printer_name, zpl, filename)
            emit_status(f"Sent raw ZPL to {printer_name}")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode("utf-8"))
        except Exception as e:
            emit_status(f"Print error: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def log_message(self, format, *args):
        # Keeps terminal clean by hiding basic HTTP GET/POST logs
        return

def main():
    server = HTTPServer(("0.0.0.0", PORT), DirectPrintHandler)
    emit_status(f"Instant Direct Print Server listening on port {PORT}...")
    server.serve_forever()

if __name__ == "__main__":
    main()
