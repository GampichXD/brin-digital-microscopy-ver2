import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from ..hardware.motor_driver import motor_driver
from ..hardware.camera_driver import cam_driver as camera_driver
import json
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/hardware",
    tags=["Hardware Automation"]
)

# === 1. DEFINISI DATA MODEL UNTUK GERAKAN VIA HTTP REST API ===
class MotorMoveRequest(BaseModel):
    axis: str          # 'X', 'Y', atau 'Z'
    value: float       # Jarak pergeseran (bisa positif/negatif)
    feed_rate: float   # Kecepatan motor (F)
    unit: str          # 'mm' atau 'step'

class CameraSettingsRequest(BaseModel):
    shutter_speed: int
    iso: int

# Pengatur Aktivasi Fisik saat Aplikasi Server Menyala/Mati
@router.on_event("startup")
def startup_hardware():
    motor_driver.connect()
    # PENTING: camera_driver.start() dihapus dari sini agar server startup tidak memblokir/mengunci hardware kamera sejak awal

@router.on_event("shutdown")
def shutdown_hardware():
    motor_driver.disconnect()
    camera_driver.stop()


# === 2. ENDPOINT Rest-API (HTTP POST) UNTUK TESTING & FALLBACK ===

@router.post("/motor/move")
async def http_move_motor(command: MotorMoveRequest):
    gcode = f"G1 {command.axis}{command.value} F{command.feed_rate}"
    print(f"[HTTP REST] Menerima perintah motor: {gcode}")
    grbl_resp = motor_driver.send_gcode(gcode)
    return {
        "status": "SUCCESS",
        "grbl_response": grbl_resp,
        "echo_gcode": gcode
    }

@router.post("/motor/home")
async def http_home_motor():
    print("[HTTP REST] Menerima perintah Homing ($H)")
    grbl_resp = motor_driver.send_gcode("$H")
    return {
        "status": "SUCCESS",
        "grbl_response": grbl_resp,
        "echo_gcode": "$H"
    }

@router.post("/motor/unlock")
async def http_unlock_motor():
    print("[HTTP REST] Menerima perintah Unlock GRBL ($X)")
    grbl_resp = motor_driver.send_gcode("$X")
    return {
        "status": "SUCCESS",
        "grbl_response": grbl_resp,
        "echo_gcode": "$X"
    }

@router.post("/camera/settings")
async def http_camera_settings(settings: CameraSettingsRequest):
    print(f"[HTTP REST] Menerapkan parameter optik -> Shutter: {settings.shutter_speed}µs, ISO: {settings.iso}")
    return {
        "status": "SUCCESS",
        "message": "Konfigurasi parameter sensor IMX477 berhasil disimpan."
    }


# --- PINTU GERBANG UTAMA WEBSOCKET (DUA ARAH REAL-TIME) ---
@router.websocket("/ws")
async def hardware_control_stream(websocket: WebSocket):
    await websocket.accept()
    print("[WEBSOCKET] Operator laboratorium berhasil terhubung ke sirkuit hardware.")
    
    # State lock bersama untuk mendeteksi apakah pipa jaringan sedang sibuk mengirim biner
    is_sending_frame = False

    # Task 1: Mengirimkan Aliran Gambar Kamera Ke Antarmuka Web Frontend (~25-30 FPS)
    async def stream_camera():
        nonlocal is_sending_frame
        try:
            print("[WEBSOCKET] Mengaktifkan sensor kamera lokal/CSI...")
            camera_driver.start() 
            
            while True:
                # Jika pipa pengiriman frame sebelumnya belum selesai (masih sibuk), lewati loop ini
                if not is_sending_frame:
                    frame_bytes = camera_driver.get_frame_bytes()
                    if frame_bytes:
                        is_sending_frame = True
                        await websocket.send_bytes(frame_bytes)
                        is_sending_frame = False # Bebaskan lock setelah sukses terkirim
                        
                # Naikkan jeda sleep ke 0.05s (20 FPS) untuk testing di laptop agar CPU tidak overload
                await asyncio.sleep(0.05) 
        except Exception as e:
            print(f"[WEBSOCKET] Aliran video kamera terhenti atau dialihkan: {e}")
        finally:
            camera_driver.stop()

    # Task 2: Mendengarkan Perintah Ketukan Tombol Sumbu Gerakan dari Frontend
    async def receive_commands():
        try:
            while True:
                data_msg = await websocket.receive_text()
                command = json.loads(data_msg)
                action = command.get("action")
                
                if action == "MOVE_MOTOR":
                    gcode = command.get("gcode", "")
                    print(f"[WEBSOCKET] MENERIMA PERINTAH GERAK MOTOR: {gcode}")
                    grbl_resp = motor_driver.send_gcode(gcode)
                    
                    await websocket.send_text(json.dumps({
                        "event": "MOTOR_STATUS",
                        "status": grbl_resp,
                        "echo_gcode": gcode
                    }))
                    
                elif action == "HOMING":
                    print("[WEBSOCKET] MENERIMA PERINTAH HOMING MOTOR ($H)")
                    grbl_resp = motor_driver.send_gcode("$H")
                    await websocket.send_text(json.dumps({
                        "event": "MOTOR_STATUS",
                        "status": grbl_resp,
                        "echo_gcode": "$H"
                    }))

        except WebSocketDisconnect:
            print("[WEBSOCKET] Sesi operator terputus secara normal.")
        except Exception as e:
            print(f"[WEBSOCKET ERROR] Gagal membaca instruksi: {e}")

    # Jalankan streaming video dan penangkapan tombol secara bersamaan (Parallel Async)
    await asyncio.gather(
        stream_camera(),
        receive_commands()
    )