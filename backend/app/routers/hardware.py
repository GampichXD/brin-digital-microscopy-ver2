from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, HTTPException
from pydantic import BaseModel
import time
import json
import asyncio
from redis import asyncio as aioredis  # Driver Redis Asinkron untuk ekosistem Docker

from ..hardware.motor_driver import motor_driver
from ..hardware.camera_driver import cam_driver as camera_driver

router = APIRouter(prefix="/api/hardware", tags=["Hardware"])

# URL Jaringan internal untuk kontainer Redis di dalam docker-compose.yml
# REDIS_URL = "redis://redis-server:6379"
REDIS_URL = "redis://127.0.0.1:6379"

# Struktur data untuk menerima kendali D-Pad manual dari Frontend Dashboard (React)
class MotorCommand(BaseModel):
    command: str

# Dictionary internal untuk mencatat timestamp instruksi terakhir dari setiap IP user
last_command_time = {}

def is_local_network(ip_address: str) -> bool:
    """Mengecek apakah IP user berasal dari jaringan lokal Jetson (Localhost/Private Subnet)."""
    if ip_address in ["127.0.0.1", "localhost", "::1"]:
        return True
    # Deteksi subnet standar laboratorium (192.168.x.x atau 10.x.x.x)
    if ip_address.startswith("192.168.") or ip_address.startswith("10."):
        return True
    return False

# ====================================================================
# 1. ROUTE HTTP POST: UNTUK KENDALI MOTOR D-PAD MANUAL USER
# ====================================================================
@router.post("/motor/move")
async def move_motor(payload: MotorCommand, request: Request):
    user_ip = request.client.host
    current_time = time.time()
    clean_gcode = payload.command.strip().upper()

    # 🟢 MODE A: AKSES LOKAL JETSON (Smooth & Tanpa Batas)
    if is_local_network(user_ip):
        print(f"[NETWORK DETECTOR] Akses Lokal Terdeteksi dari {user_ip}. Eksekusi Instan.")
        response = motor_driver.send_gcode(clean_gcode)
        return {"status": "SUCCESS", "mode": "LOCAL", "grbl_response": response}

    # 🔴 MODE B: AKSES JARAK JAUH / VIA VPS INTERNET (Smooth & Aman)
    else:
        print(f"[NETWORK DETECTOR] Akses Jarak Jauh Terdeteksi dari {user_ip}. Menerapkan Guard.")
        last_time = last_command_time.get(user_ip, 0)
        
        # Guard Throttling: Interval 500ms mencegah penumpukan buffer akibat ping internet lag
        if current_time - last_time < 0.5:
            print(f"[GUARD WARNING] Perintah dari {user_ip} diblokir sementara (Over-speed).")
            raise HTTPException(
                status_code=429, 
                detail="Perintah terlalu cepat! Mohon beri jeda transmisi internet demi keamanan mekanik CNC."
            )
        
        last_command_time[user_ip] = current_time
        
        # Meneruskan perintah ke relay driver (yang nantinya melempar JSON ke Jetson)
        response = motor_driver.send_gcode(clean_gcode)
        return {"status": "SUCCESS", "mode": "REMOTE_GUARDED", "grbl_response": response}


# ====================================================================
# 2. PIPA WEBSOCKET UTAMA: JEMBATAN ANTARA VPS CLOUD & JETSON EDGE
# ====================================================================
@router.websocket("/ws")
async def hardware_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    redis = await aioredis.from_url(REDIS_URL)
    motor_driver.register_jetson(websocket)
    print("[VPS ROUTER] Sirkuit pipa WebSocket Jetson Orin Nano Berhasil Dibuka.")
    
    # Simpan task agar bisa dibatalkan secara bersih saat disconnect
    listener_task = None
    
    async def redis_listener():
        pubsub = redis.pubsub()
        await pubsub.subscribe("hardware_commands")
        try:
            async for message in pubsub.listen():
                if message['type'] == 'data':
                    command_payload = message['data'].decode('utf-8')
                    await websocket.send_text(command_payload)
        except asyncio.CancelledError:
            print("[VPS REDIS] Listener dibatalkan secara bersih.")
        except Exception as e:
            print(f"[VPS REDIS LISTENER ERROR] Terjadi interupsi channel: {e}")
        finally:
            await pubsub.unsubscribe("hardware_commands")
            await pubsub.close()

    # Jalankan task dan simpan referensinya
    listener_task = asyncio.create_task(redis_listener())
    
    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            event_type = data.get("event")
            
            if event_type == "STREAM_DATA":
                raw_base64 = data.get("image")
                if raw_base64:
                    camera_driver.update_frame(raw_base64)
                    await redis.publish("microscope_video_stream", message)
                
            elif event_type == "TELEMETRY_DATA":
                await redis.publish("microscope_telemetry", message)
                
            elif event_type == "MOTOR_MOVED":
                print(f"[VPS ROUTER FEEDBACK] Respon balik GRBL: {data.get('grbl_response')}")
                await redis.publish("microscope_motor_feedback", message)
                
            elif event_type in ["STITCHING_COMPLETE", "COUNTING_COMPLETE", "EDIT_COMPLETE"]:
                filename = data.get("filename", "output.jpg")
                img_b64_data = data.get("image_data", "")
                
                if img_b64_data and "," in img_b64_data:
                    header, base64_str = img_b64_data.split(",", 1)
                    try:
                        image_bytes = base64.b64decode(base64_str)
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        with open(file_path, "wb") as f:
                            f.write(image_bytes)
                        print(f"[VPS STORAGE SUCCESS] Berhasil menulis hasil AI ke disk: {file_path}")
                        await redis.publish("microscope_analysis_result", message)
                    except Exception as err:
                        print(f"[VPS STORAGE ERROR] Gagal mendecode gambar Base64: {err}")
                
    except WebSocketDisconnect:
        print("[VPS ROUTER WARNING] Koneksi Jetson Orin Nano terputus dari sirkuit cloud.")
    finally:
        # 🟢 PERBAIKAN UTAMA: Batalkan task background sebelum menutup redis
        if listener_task and not listener_task.done():
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass
        
        motor_driver.unregister_jetson()
        camera_driver.stop()
        await redis.close()

# ====================================================================
# 3. WEBSOCKET KHUSUS CLIENT CLIENT (BROWSER REACT)
# ====================================================================
@router.websocket("/client/ws")
async def client_websocket_endpoint(websocket: WebSocket):
    """Endpoint tempat browser user (React) terhubung untuk memantau video & telemetri."""
    await websocket.accept()
    redis = await aioredis.from_url(REDIS_URL)
    pubsub = redis.pubsub()
    
    # Langsung ikut mendengarkan dua channel siaran utama dari Redis
    await pubsub.subscribe("microscope_video_stream", "microscope_telemetry")
    print("[VPS CLIENT] Browser user terhubung ke piringan distribusi data.")
    
    try:
        async for message in pubsub.listen():
            if message['type'] == 'data':
                # Teruskan data video/telemetri dari Redis langsung ke layar browser React
                await websocket.send_text(message['data'].decode('utf-8'))
    except WebSocketDisconnect:
        print("[VPS CLIENT] Browser user menutup tab / disconnect.")
    finally:
        await pubsub.unsubscribe("microscope_video_stream", "microscope_telemetry")
        await pubsub.close()
        await redis.close()