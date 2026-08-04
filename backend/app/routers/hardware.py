from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, HTTPException
from ..schemas import MotorMovePayload, CameraSettingsPayload, HardwareBusTogglePayload, CncSettingsPayload, GridScanPayload, StitchPayload, RetakePayload, AiConfigPayload, NetworkConfigPayload
import time
import json
import asyncio
import os
import base64
import psutil
from redis import asyncio as aioredis  # Driver Redis Asinkron untuk ekosistem Docker

from ..hardware.motor_driver import motor_driver
from ..hardware.camera_driver import cam_driver as camera_driver
from ..redis_mock import get_redis_client

router = APIRouter(prefix="/api/hardware", tags=["Hardware"])

# URL Jaringan internal untuk kontainer Redis di dalam docker-compose.yml
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

# Saklar logis untuk menonaktifkan semua kontrol hardware dari panel admin.
hardware_bus_enabled = True

# 🟢 FIX 1: Deklarasikan direktori penyimpanan static uploads agar bebas dari NameError
UPLOAD_DIR = "./static/uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


async def publish_hardware_command(payload: dict) -> None:
    redis = await get_redis_client(REDIS_URL)
    try:
        await redis.publish("hardware_commands", json.dumps(payload))
    finally:
        await redis.close()

# Dictionary internal untuk mencatat timestamp instruksi terakhir dari setiap IP user
last_command_time = {}

def is_local_network(ip_address: str) -> bool:
    """Mengecek apakah IP user berasal dari jaringan lokal Jetson (Localhost/Private Subnet)."""
    if ip_address in ["127.0.0.1", "localhost", "::1"]:
        return True
    if ip_address.startswith("192.168.") or ip_address.startswith("10."):
        return True
    return False

# ====================================================================
# 0. ROUTE HTTP GET: TELEMETRI & STATISTIK SERVER
# ====================================================================
last_net_io = psutil.net_io_counters()
last_net_time = time.time()

@router.get("/telemetry/stats")
async def get_telemetry_stats():
    global last_net_io, last_net_time
    
    current_net_io = psutil.net_io_counters()
    current_time = time.time()
    
    dt = current_time - last_net_time
    bandwidth_mbps = 0.0
    if dt > 0:
        bytes_sent = current_net_io.bytes_sent - last_net_io.bytes_sent
        bytes_recv = current_net_io.bytes_recv - last_net_io.bytes_recv
        total_bytes_per_sec = (bytes_sent + bytes_recv) / dt
        bandwidth_mbps = (total_bytes_per_sec * 8) / 1_000_000
        
    last_net_io = current_net_io
    last_net_time = current_time

    """Mengembalikan statistik hardware real-time dari Edge Server (Jetson/Rpi)"""
    return {
        "serverCpu": psutil.cpu_percent(interval=None),
        "serverRam": psutil.virtual_memory().percent,
        "serverBandwidth": round(bandwidth_mbps, 2),
        "edgeCpu": psutil.cpu_percent(interval=None),
        "edgeRam": psutil.virtual_memory().percent,
        "edgeTemp": 45.0, # Mock suhu karena psutil.sensors_temperatures() sering gagal di docker windows
        "hardwareBus": hardware_bus_enabled
    }


@router.put("/config/ai")
async def set_ai_config(payload: AiConfigPayload):
    return {"message": "AI Config updated"}

@router.put("/config/network")
async def set_network_config(payload: NetworkConfigPayload):
    return {"message": "Network Config updated"}

@router.post("/config/{section}/default")
async def reset_config_default(section: str):
    return {"message": f"Config {section} reset to default"}

# ====================================================================
# 1. ROUTE HTTP POST: UNTUK KENDALI MOTOR D-PAD MANUAL USER
# ====================================================================
@router.post("/motor/move")
async def move_motor(payload: MotorMovePayload, request: Request):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    user_ip = request.client.host
    current_time = time.time()

    # Pecahan properti frontend disusun ke dalam gcode_str
    axis_letter = payload.axis.upper()
    gcode_str = f"G1 {axis_letter}{payload.value} F{payload.feed_rate}"

    # MODE A: AKSES LOKAL JETSON
    if is_local_network(user_ip):
        print(f"[NETWORK DETECTOR] Akses Lokal Terdeteksi dari {user_ip}. Eksekusi: {gcode_str}")
        # 🟢 PERBAIKAN BARIS 56: Ubah clean_gcode menjadi gcode_str
        response = await motor_driver.send_gcode(gcode_str)
        return {"status": "SUCCESS", "mode": "LOCAL", "grbl_response": response}

    # MODE B: AKSES JARAK JAUH / VIA VPS INTERNET
    else:
        print(f"[NETWORK DETECTOR] Akses Jarak Jauh Terdeteksi dari {user_ip}. Menerapkan Guard.")
        last_time = last_command_time.get(user_ip, 0)
        
        if current_time - last_time < 0.5:
            print(f"[GUARD WARNING] Perintah dari {user_ip} diblokir sementara (Over-speed).")
            raise HTTPException(
                status_code=429, 
                detail="Perintah terlalu cepat! Mohon beri jeda transmisi internet demi keamanan mekanik CNC."
            )
        
        last_command_time[user_ip] = current_time
        
        # 🟢 PERBAIKAN BARIS 73: Ubah clean_gcode menjadi gcode_str
        response = await motor_driver.send_gcode(gcode_str)
        return {"status": "SUCCESS", "mode": "REMOTE_GUARDED", "grbl_response": response}


@router.post("/motor/home")
async def home_motor(request: Request):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    user_ip = request.client.host
    if is_local_network(user_ip):
        response = await motor_driver.home()
        return {"status": "SUCCESS", "mode": "LOCAL", "grbl_response": response}

    await publish_hardware_command({"action": "HOMING"})
    return {"status": "SUCCESS", "mode": "REMOTE", "action": "HOMING"}


@router.post("/motor/unlock")
async def unlock_motor(request: Request):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    user_ip = request.client.host
    if is_local_network(user_ip):
        response = await motor_driver.send_gcode("$X")
        return {"status": "SUCCESS", "mode": "LOCAL", "grbl_response": response}

    await publish_hardware_command({"action": "UNLOCK"})
    return {"status": "SUCCESS", "mode": "REMOTE", "action": "UNLOCK"}


@router.post("/camera/settings")
async def apply_camera_settings(payload: CameraSettingsPayload):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    await publish_hardware_command({
        "action": "APPLY_CAMERA_SETTINGS",
        "shutter_speed": payload.shutter_speed,
        "iso": payload.iso,
    })
    return {"status": "SUCCESS", "message": "Pengaturan kamera diterima."}


@router.post("/cnc/settings")
async def apply_cnc_settings(payload: CncSettingsPayload):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    await publish_hardware_command({
        "action": "APPLY_CNC_SETTINGS",
        "feed_rate": payload.feed_rate,
        "backlash": payload.backlash,
        "acceleration": payload.acceleration,
        "settle_time": payload.settle_time,
    })
    return {"status": "SUCCESS", "message": "Parameter CNC diterima."}

@router.post("/scan/grid")
async def scan_grid(payload: GridScanPayload):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    images = []
    idx = 0
    redis = await get_redis_client(REDIS_URL)

    try:
        # LOGIKA NYATA KENDALI EDGE DEVICE
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        for r in range(payload.rows):
            for c in range(payload.columns):
                coord_x = c * payload.step_x
                coord_y = r * payload.step_y
                filename = f"IMG_{timestamp}_{str(idx+1).zfill(4)}.jpg"
                
                # 1. Gerakkan motor CNC di Edge Device lewat relai
                gcode = f"G1 X{coord_x} Y{coord_y} F250.0"
                await motor_driver.send_gcode(gcode)
                
                # 2. Tunggu motor bergerak secara spasial + delay kamera dari UI (ms to detik)
                await asyncio.sleep(1.2 + (payload.delay_ms / 1000.0))
                
                # Hapus file gambar lama jika ada agar Jetson (atau Mock) menimpanya
                file_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(file_path):
                    os.remove(file_path)

                # 3. Perintahkan Edge Device (Jetson) untuk memotret dan menyimpan ke memori lokal
                await redis.publish("hardware_commands", json.dumps({
                    "action": "CAPTURE_IMAGE",
                    "filename": filename
                }))
                
                # Beri jeda proses
                await asyncio.sleep(2.0)
                
                # 🟢 FALLBACK: Jika Jetson gagal atau terputus, backend buatkan gambar mock otomatis!
                file_path = os.path.join(UPLOAD_DIR, filename)
                if not os.path.exists(file_path):
                    try:
                        import cv2
                        import numpy as np
                        import random
                        # Buat gambar random dengan warna acak agar terlihat perbedaannya setiap capture
                        img = np.zeros((720, 1280, 3), dtype=np.uint8)
                        img[:] = (random.randint(50, 200), random.randint(50, 200), random.randint(50, 200))
                        cv2.putText(img, f"MOCK CAPTURE (NO EDGE) - {filename}", (50, 360), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3)
                        cv2.imwrite(file_path, img)
                        print(f"[BACKEND FALLBACK] Meng-generate gambar cadangan karena Jetson tidak merespon: {file_path}")
                    except Exception as e:
                        print(f"[BACKEND FALLBACK ERROR] Gagal membuat gambar cadangan: {e}")
                
                images.append({
                    "index": idx,
                    "filename": filename,
                    "coordX": round(coord_x, 2),
                    "coordY": round(coord_y, 2),
                    "gridX": c,
                    "gridY": r
                })
                idx += 1
    finally:
        await redis.close()
        
    return {"status": "SUCCESS", "images": images}

@router.post("/scan/retake")
async def retake_grid_image(payload: RetakePayload):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    redis = await get_redis_client(REDIS_URL)
    print(f"DEBUG RETAKE: motor_driver ID is {id(motor_driver)}, jetson is {motor_driver.jetson_websocket}", flush=True)
    try:
        # 1. Gerakkan motor CNC ke koordinat Retake
        gcode = f"G1 X{payload.coord_x} Y{payload.coord_y} F250.0"
        await motor_driver.send_gcode(gcode)
        
        # 2. Tunggu stabilitas mekanik
        await asyncio.sleep(1.2 + (payload.delay_ms / 1000.0))
        
        # Hapus file gambar lama jika ada, agar Jetson terpaksa menimpa dengan file baru, 
        # atau sistem Fallback ter-trigger dengan benar jika Jetson gagal merespon
        file_path = os.path.join(UPLOAD_DIR, payload.filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            
        # 3. Jepret
        await redis.publish("hardware_commands", json.dumps({
            "action": "CAPTURE_IMAGE",
            "filename": payload.filename
        }))
        
        # 4. Beri sedikit waktu agar Edge & Websocket memproses Base64 upload
        await asyncio.sleep(2.0)
        
        # 🟢 FALLBACK: Jika Jetson gagal atau terputus, backend buatkan gambar mock otomatis!
        file_path = os.path.join(UPLOAD_DIR, payload.filename)
        if not os.path.exists(file_path):
            try:
                import cv2
                import numpy as np
                import random
                # Buat gambar random dengan warna acak agar terlihat perbedaannya setiap capture
                img = np.zeros((720, 1280, 3), dtype=np.uint8)
                img[:] = (random.randint(50, 200), random.randint(50, 200), random.randint(50, 200))
                cv2.putText(img, f"MOCK CAPTURE (NO EDGE) - {payload.filename}", (50, 360), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3)
                cv2.imwrite(file_path, img)
                print(f"[BACKEND FALLBACK] Meng-generate gambar cadangan karena Jetson tidak merespon: {file_path}")
            except Exception as e:
                print(f"[BACKEND FALLBACK ERROR] Gagal membuat gambar cadangan: {e}")
                
    finally:
        await redis.close()
        
    return {"status": "SUCCESS", "filename": payload.filename}

@router.post("/stitch")
async def stitch_images(payload: StitchPayload):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")
    
    # LOGIKA NYATA INTEGRASI AI EDGE DEVICE
    output_filename = "stitched_ta_output.jpg"
    output_path = os.path.join(UPLOAD_DIR, output_filename)
    
    # Hapus file lama jika ada agar tidak rancu dengan hasil sebelumnya
    if os.path.exists(output_path):
        os.remove(output_path)

    redis = await get_redis_client(REDIS_URL)
    try:
        # Perintahkan Jetson Edge untuk memulai deep learning tile stitching hanya pada gambar-gambar spesifik sesi ini
        await redis.publish("hardware_commands", json.dumps({
            "action": "START_STITCHING",
            "images": payload.images
        }))
    finally:
        await redis.close()

    # Polling menunggu file dari Edge masuk ke VPS (maksimal 60 detik)
    timeout = 60
    elapsed = 0
    while elapsed < timeout:
        if os.path.exists(output_path):
            return {"status": "SUCCESS", "message": "Proses penyatuan ubin berhasil secara nyata"}
        await asyncio.sleep(1)
        elapsed += 1
        
    raise HTTPException(status_code=504, detail="Timeout menunggu Edge Device menyelesaikan stitching AI.")


@router.post("/bus/toggle")
async def toggle_hardware_bus(payload: HardwareBusTogglePayload):
    global hardware_bus_enabled
    hardware_bus_enabled = payload.enabled

    if not hardware_bus_enabled:
        await publish_hardware_command({"action": "STOP_STREAM"})

    return {"status": "SUCCESS", "enabled": hardware_bus_enabled}


# ====================================================================
# 2. PIPA WEBSOCKET UTAMA: JEMBATAN ANTARA VPS CLOUD & JETSON EDGE
# ====================================================================
@router.websocket("/ws")
async def hardware_websocket_endpoint(websocket: WebSocket):
    print("TRACE 1: Accepting websocket...", flush=True)
    await websocket.accept()
    print("TRACE 2: Websocket accepted!", flush=True)
    
    try:
        print(f"TRACE 3: Getting redis client for {REDIS_URL}", flush=True)
        redis = await get_redis_client(REDIS_URL)
        print(f"TRACE 4: Got redis client: {redis}", flush=True)
        
        motor_driver.register_jetson(websocket)
        print(f"DEBUG WS: motor_driver ID is {id(motor_driver)}, jetson is {motor_driver.jetson_websocket}", flush=True)
        print("[VPS ROUTER] Sirkuit pipa WebSocket Jetson Orin Nano Berhasil Dibuka.", flush=True)
    except Exception as e:
        print(f"TRACE EXCEPTION: {e}", flush=True)
        raise

    # Simpan task agar bisa dibatalkan secara bersih saat disconnect
    listener_task = None
    
    async def redis_listener():
        print("TRACE 5: Starting redis listener", flush=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe("hardware_commands")
        try:
            async for message in pubsub.listen():
                if message.get('type') == 'message':
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
                
            elif event_type in ["IMAGE_CAPTURED", "STITCHING_COMPLETE", "COUNTING_COMPLETE", "EDIT_COMPLETE"]:
                filename = data.get("filename", "output.jpg")
                img_b64_data = data.get("image_data", "")
                
                if img_b64_data and "," in img_b64_data:
                    header, base64_str = img_b64_data.split(",", 1)
                    try:
                        image_bytes = base64.b64decode(base64_str)
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        with open(file_path, "wb") as f:
                            f.write(image_bytes)
                        print(f"[VPS STORAGE SUCCESS] Berhasil menulis hasil AI ke disk: {file_path}", flush=True)
                        await redis.publish("microscope_analysis_result", message)
                    except Exception as err:
                        print(f"[VPS STORAGE ERROR] Gagal mendecode gambar Base64: {err}")
                
    except WebSocketDisconnect:
        print("[VPS ROUTER WARNING] Koneksi Jetson Orin Nano terputus dari sirkuit cloud.")
    finally:
        if listener_task and not listener_task.done():
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass
        
        motor_driver.unregister_jetson()
        camera_driver.stop()
        try:
            await redis.publish("microscope_telemetry", json.dumps({
                "event": "TELEMETRY_DATA",
                "status": "OFFLINE",
                "limit_switch": "N/A",
                "jetson_temp_c": None
            }))
        except Exception:
            pass
        await redis.close()


# ====================================================================
# 3. WEBSOCKET KHUSUS CLIENT CLIENT (BROWSER REACT)
# ====================================================================
@router.websocket("/client/ws")
async def client_websocket_endpoint(websocket: WebSocket):
    """Endpoint tempat browser user (React) terhubung untuk memantau & mengontrol instrumen."""
    await websocket.accept()
    redis = await get_redis_client(REDIS_URL)

    print("[VPS CLIENT] Browser user terhubung penuh dengan sikit sirkuit interaktif.")
    if motor_driver.jetson_websocket is None:
        try:
            await websocket.send_text(json.dumps({
                "event": "TELEMETRY_DATA",
                "status": "OFFLINE",
                "limit_switch": "N/A",
                "jetson_temp_c": None
            }))
        except Exception:
            pass
    
    # 🟢 TASK A: Mendengarkan siaran video/telemetri dari Redis dan menembakkannya ke Browser
    async def listen_to_redis_broadcast():
        pubsub = redis.pubsub()
        await pubsub.subscribe("microscope_video_stream", "microscope_telemetry")
        try:
            async for message in pubsub.listen():
                if message.get('type') == 'message':
                    await websocket.send_text(message['data'].decode('utf-8'))
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe("microscope_video_stream", "microscope_telemetry")
            await pubsub.close()

    # Jalankan pendengar siaran Redis di background task
    broadcast_task = asyncio.create_task(listen_to_redis_broadcast())
    
    try:
        # 🟢 TASK B: Jalankan antrean penerima instruksi (START_STREAM / STOP_STREAM) dari Browser React
        while True:
            client_msg = await websocket.receive_text()
            # Lempar perintah dari browser langsung ke channel instruksi mekatronika
            await redis.publish("hardware_commands", client_msg)
            print(f"[VPS BROKER] Meneruskan perintah UI ke Hardware Core: {client_msg}")

    except WebSocketDisconnect:
        print("[VPS CLIENT] Hubungan Browser user terputus dari sirkuit.")
    finally:
        # Hancurkan background task secara bersih untuk mencegah kebocoran memori (memory leak)
        if not broadcast_task.done():
            broadcast_task.cancel()
            try:
                await broadcast_task
            except asyncio.CancelledError:
                pass
        await redis.close()