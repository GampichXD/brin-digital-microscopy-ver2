import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from ..hardware.motor_driver import motor_driver
from ..hardware.camera_driver import camera_driver
import json
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/hardware",
    tags=["Hardware Automation"]
)

# Pengatur Aktivasi Fisik saat Aplikasi Server Menyala/Mati
@router.on_event("startup")
def startup_hardware():
    motor_driver.connect()
    camera_driver.start()

@router.on_event("shutdown")
def shutdown_hardware():
    motor_driver.disconnect()
    camera_driver.stop()


# --- PINTU GERBANG UTAMA WEBSOCKET (DUA ARAH REAL-TIME) ---
@router.websocket("/ws")
async def hardware_control_stream(websocket: WebSocket):
    await websocket.accept()
    print("[WEBSOCKET] Operator laboratorium berhasil terhubung ke sirkuit hardware.")
    
    # Task 1: Mengirimkan Aliran Gambar Kamera Ke Antarmuka Web Frontend (~25-30 FPS)
    async def stream_camera():
        try:
            while True:
                frame_bytes = camera_driver.get_frame_bytes()
                if frame_bytes:
                    await websocket.send_bytes(frame_bytes)
                await asyncio.sleep(0.04) # Pembatas kecepatan pemrosesan agar Jetson stabil
        except Exception as e:
            print(f"[WEBSOCKET] Aliran video kamera terhenti: {e}")

    # Task 2: Mendengarkan Perintah Ketukan Tombol Sumbu Gerakan dari Frontend
    async def receive_commands():
        try:
            while True:
                data_msg = await websocket.receive_text()
                command = json.loads(data_msg)
                action = command.get("action")
                
                if action == "MOVE_MOTOR":
                    gcode = command.get("gcode", "")
                    grbl_resp = motor_driver.send_gcode(gcode)
                    
                    # Balas balik ke monitor user berupa umpan balik status kesiapan mesin
                    await websocket.send_text(json.dumps({
                        "event": "MOTOR_STATUS",
                        "status": grbl_resp,
                        "echo_gcode": gcode
                    }))
                    
                elif action == "HOMING":
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