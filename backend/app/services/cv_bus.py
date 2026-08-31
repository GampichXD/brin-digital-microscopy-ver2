"""
Jembatan status Computer Vision Edge (Jetson) <-> request HTTP Image Analysis.

Handler WebSocket Jetson (routers/hardware.py) menulis ke sini saat menerima
CV_RESULT / CV_FAILED; endpoint /api/analysis/{tool} (routers/analysis.py)
membacanya sambil menunggu, supaya kegagalan di Edge langsung dilaporkan ke
browser (bukan menunggu timeout penuh).

Modul singleton — cukup kecil, tak perlu Redis.
"""

# output_name (nama file hasil yang ditunggu backend) -> {"error": str}
edge_status = {}


def mark_failed(output_name, detail):
    key = output_name or "?"
    edge_status[key] = {"error": detail or "CV gagal di Edge Device."}
    if len(edge_status) > 64:
        for k in list(edge_status)[:32]:
            edge_status.pop(k, None)


def clear(output_name):
    edge_status.pop(output_name, None)


def take_error(output_name):
    # type: (str) -> Optional[str]
    entry = edge_status.pop(output_name, None)
    return entry["error"] if entry else None
