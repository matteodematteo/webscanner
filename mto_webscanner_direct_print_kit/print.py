import csv
import ctypes
import json
import time
from ctypes import wintypes
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer

# ---------------------------
# USER VARIABLES
# ---------------------------
PORT = 5000
PRINTER_40X25_NAME = "Zebra GC420d - EPL (副本 1)" # Change this to your exact printer name
PRINTER_60X38_NAME = "Zebra GC420d - EPL" # Change this to your exact printer name
SHOW_TERMINAL_MESSAGES = True

@dataclass
class PrintRow:
    barcode: str
    qty: int
    italian_name: str
    price: str

def emit_status(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    if SHOW_TERMINAL_MESSAGES:
        print(f"[{timestamp}] {message}", flush=True)

def normalize_text(value: str) -> str:
    text = (value or "").strip()
    return text.replace("^", " ").replace("~", " ").replace("\r", " ").replace("\n", " ")

def format_price(value: str) -> str:
    cleaned = (value or "").strip().replace(",", ".")
    try:
        number = float(cleaned)
    except ValueError:
        return cleaned
    return f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def parse_int(value: str, default: int = 1) -> int:
    try:
        parsed = int(str(value).strip())
        return parsed if parsed > 0 else default
    except Exception:
        return default

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

def parse_direct_line(line: str) -> PrintRow | None:
    stripped = line.strip()
    if not stripped:
        return None
    reader = csv.reader([stripped])
    row = next(reader, [])
    if len(row) >= 4:
        barcode = normalize_text(row[0])
        qty = parse_int(row[1], 1)
        italian_name = normalize_text(row[2])
        price = format_price(row[3])
        if barcode:
            return PrintRow(barcode=barcode, qty=qty, italian_name=italian_name, price=price)
    return None

# -------------------------------------------------------------------------
# ZPL GENERATORS (Fixed with ^FO top-down wrapping to prevent overlap)
# -------------------------------------------------------------------------

def build_zpl_40x25(row: PrintRow) -> str:
    name = normalize_text(row.italian_name)
    barcode = normalize_text(row.barcode)
    price = format_price(row.price)
    qty = max(1, row.qty)
    
    # ^FB319,2,4,C -> Max 2 lines, 4 dots between lines, Centered
    return (
        "^XA^CI28^PON^LH0,0^LL200^PW319"
        f"^FO0,15^A0N,26,26^FB319,2,4,C^FD{name}^FS"
        f"^FO0,75^A0N,55,55^FB319,1,0,C^FD€ {price}^FS"
        f"^FO40,140^BY1,2,35^BCN,35,Y,N,N^FD{barcode}^FS"
        f"^PQ{qty}^XZ"
    )

def build_zpl_60x38(row: PrintRow) -> str:
    name = normalize_text(row.italian_name)
    barcode = normalize_text(row.barcode)
    price = format_price(row.price)
    qty = max(1, row.qty)
    
    # ^CI28 enables UTF-8 character interpretation
    return (
        "^XA^CI28^PON^LH0,0^LL304^PW480"
        f"^FO0,10^A0N,36,36^FB480,2,6,C^FD{name}^FS"
        f"^FO0,90^A0N,75,75^FB480,1,0,C^FD€ {price}^FS"
        f"^FO90,170^BY2,2,55^BCN,55,Y,N,N^FD{barcode}^FS"
        f"^PQ{qty}^XZ"
    )

def build_zpl(row: PrintRow, label_size: str) -> str:
    if label_size == "40x25":
        return build_zpl_40x25(row)
    if label_size == "60x38":
        return build_zpl_60x38(row)
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
            filename = data.get("filename", "")
            content = data.get("content", "")

            label_size = detect_label_size(filename)
            printer_name = select_printer(label_size)
            emit_status(f"Direct Print Request Received: {filename}")

            for line in content.splitlines():
                row = parse_direct_line(line)
                if row:
                    zpl = build_zpl(row, label_size)
                    send_raw_to_printer(printer_name, zpl, f"{label_size}_{row.barcode}")
                    emit_status(f"Printed: {row.barcode} x{row.qty}")

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