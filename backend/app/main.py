from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import serial
import time

app = FastAPI(title="CNC Digital Microscope API")

# Setup koneksi Serial ke CNC (Sesuaikan port dengan sistemmu, misal COM3 atau /dev/ttyUSB0)
# Untuk simulasi tanpa alat, kita bungkus dalam try-except
try:
    # serial_cnc = serial.Serial(port='/dev/ttyUSB0', baudrate=115200, timeout=1)
    serial_cnc = None
    print("Mode Simulasi: CNC belum tersambung fisik.")
except Exception as e:
    serial_cnc = None
    print(f"Gagal membuka port serial: {e}")

# Skema data untuk request pergerakan dari React
class MoveCommand(BaseModel):
    axis: str       # 'X', 'Y', atau 'Z'
    direction: str  # 'forward' atau 'backward'

@app.get("/")
def read_root():
    return {"status": "Backend Python Berjalan Lancar"}

@app.post("/api/control/move")
async def move_cnc(command: MoveCommand):
    # Tentukan besarnya pergerakan (misal tiap klik bergeser 10mm)
    jarak = 10
    tanda = "" if command.direction == "forward" else "-"
    
    # Format perintah G-code standar (G0 = pergerakan cepat, G91 = mode relatif)
    gcode = f"G91\nG0 {command.axis}{tanda}{jarak}\n"
    
    print(f"Mengirim G-code: {gcode.strip()}")
    
    # Jalankan perintah jika hardware terhubung
    if serial_cnc and serial_cnc.is_open:
        serial_cnc.write(gcode.encode())
        # Membaca respon balik dari CNC (biasanya 'ok')
        response = serial_cnc.readline().decode().strip()
        return {"status": "success", "message": f"Sumbu {command.axis} bergerak. Respon mesin: {response}"}
    
    # Respon simulasi jika hardware belum dicolok
    return {
        "status": "simulation", 
        "message": f"[Simulasi] Berhasil mengirimkan perintah {gcode.strip()} ke mesin CNC."
    }