from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, HTTPException, Query, Depends
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..services.auth_service import SECRET_KEY, ALGORITHM
from ..schemas import MotorMovePayload, CameraSettingsPayload, HardwareBusTogglePayload, CncSettingsPayload, GridScanPayload, StitchPayload, RetakePayload, AiConfigPayload, NetworkConfigPayload, AdminRoomActionPayload
import time
import json
import asyncio
import os
import base64
import psutil
import uuid
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

def save_setting(db: Session, key: str, value: str):
    setting = db.query(models.SystemSetting).filter_by(key=key).first()
    if setting:
        setting.value = value
    else:
        setting = models.SystemSetting(key=key, value=value)
        db.add(setting)
    db.commit()

@router.get("/config")
async def get_system_config(db: Session = Depends(get_db)):
    settings = db.query(models.SystemSetting).all()
    config_dict = {s.key: s.value for s in settings}
    return config_dict

@router.put("/config/ai")
async def set_ai_config(payload: AiConfigPayload, db: Session = Depends(get_db)):
    save_setting(db, "aiModel", payload.model)
    save_setting(db, "confThreshold", str(payload.confThreshold))
    return {"message": "AI Config updated"}

@router.put("/config/network")
async def set_network_config(payload: NetworkConfigPayload, db: Session = Depends(get_db)):
    save_setting(db, "ipBinding", payload.ipBinding)
    save_setting(db, "apiPort", payload.apiPort)
    return {"message": "Network Config updated"}

@router.post("/config/{section}/default")
async def reset_config_default(section: str, db: Session = Depends(get_db)):
    # Hapus semua record yang berhubungan dengan section dari db
    # Untuk simulasi: reset tidak benar-benar menghapus, biarkan default fallback dari frontend 
    # Atau kita bisa mendelete row-row tersebut
    keys_to_delete = []
    if section.lower() == 'cnc':
        keys_to_delete = ['feedRate', 'backlash', 'acceleration', 'settle_time']
    elif section.lower() == 'camera':
        keys_to_delete = ['cameraRes', 'cameraFps', 'exposure', 'videoSource']
    elif section.lower() == 'ai':
        keys_to_delete = ['aiModel', 'confThreshold']
    elif section.lower() == 'network':
        keys_to_delete = ['ipBinding', 'apiPort']
        
    for k in keys_to_delete:
        db.query(models.SystemSetting).filter_by(key=k).delete()
    db.commit()
    
    return {"message": f"Config {section} reset to default"}

@router.post("/room/admin_action")
async def perform_admin_action(payload: AdminRoomActionPayload):
    success = await room_manager.admin_action(payload.cid, payload.action)
    if success:
        return {"status": "SUCCESS", "message": f"Action {payload.action} executed on {payload.cid}"}
    raise HTTPException(status_code=404, detail="Connection ID not found")

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
async def apply_camera_settings(payload: CameraSettingsPayload, db: Session = Depends(get_db)):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    save_setting(db, "exposure", str(payload.iso))
    # Misal kita simpan iso/shutter speed sesuai key UI
    
    await publish_hardware_command({
        "action": "APPLY_CAMERA_SETTINGS",
        "shutter_speed": payload.shutter_speed,
        "iso": payload.iso,
    })
    return {"status": "SUCCESS", "message": "Pengaturan kamera diterima dan disimpan."}


@router.post("/cnc/settings")
async def apply_cnc_settings(payload: CncSettingsPayload, db: Session = Depends(get_db)):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    save_setting(db, "feedRate", str(payload.feed_rate))
    save_setting(db, "backlash", str(payload.backlash))
    save_setting(db, "acceleration", str(payload.acceleration))
    save_setting(db, "settle_time", str(payload.settle_time))

    await publish_hardware_command({
        "action": "APPLY_CNC_SETTINGS",
        "feed_rate": payload.feed_rate,
        "backlash": payload.backlash,
        "acceleration": payload.acceleration,
        "settle_time": payload.settle_time,
    })
    return {"status": "SUCCESS", "message": "Pengaturan CNC diterima dan disimpan."}

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
        import math
        
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # ── Titik awal grid = POSISI MOTOR SAAT INI (bukan 0,0) ──────────────
        # Ambil dari cache telemetri Edge. Jika Jetson terhubung tapi telemetri
        # belum masuk, tunggu sebentar; kalau tetap kosong -> tolak (jangan
        # diam-diam scan dari 0,0 dan bikin CNC "homing").
        if motor_driver.jetson_websocket is not None:
            waited = 0.0
            while motor_driver.last_edge_position is None and waited < 3.0:
                await asyncio.sleep(0.2)
                waited += 0.2
            if motor_driver.last_edge_position is None:
                raise HTTPException(
                    status_code=409,
                    detail="Posisi motor belum diketahui dari telemetri Edge. "
                           "Gerakkan motor sedikit atau tunggu beberapa detik lalu ulangi."
                )
            origin_x = motor_driver.last_edge_position["X"]
            origin_y = motor_driver.last_edge_position["Y"]
            print(f"[SCAN GRID] Titik awal = posisi motor saat ini: X{origin_x:.3f} Y{origin_y:.3f}")
        else:
            # Tidak ada Edge (mode mock) — pakai nilai dari frontend apa adanya.
            origin_x, origin_y = payload.start_x, payload.start_y
            print(f"[SCAN GRID] Edge offline, titik awal dari frontend: X{origin_x} Y{origin_y}")

        feed_rate_mm_per_sec = 250.0 / 60.0  # F250
        total_tiles = payload.rows * payload.columns

        # Kabari frontend bahwa scan dimulai (untuk progress bar berbasis event nyata).
        await redis.publish("microscope_scan_progress", json.dumps({
            "event": "SCAN_STARTED", "total": total_tiles
        }))

        # Kunci mode ABSOLUT, lalu gerak eksplisit ke posisi awal (image ke-1
        # diambil tepat di posisi motor sekarang).
        await redis.publish("hardware_commands", json.dumps({"action": "MOVE_MOTOR", "gcode": "G90"}))
        await asyncio.sleep(0.05)
        await redis.publish("hardware_commands", json.dumps({
            "action": "MOVE_MOTOR",
            "gcode": f"G1 X{origin_x:.3f} Y{origin_y:.3f} F250.0"
        }))
        last_x, last_y = origin_x, origin_y

        for r in range(payload.rows):
            for c in range(payload.columns):
                # Snake pattern (Boustrophedon)
                actual_c = c if r % 2 == 0 else (payload.columns - 1 - c)

                coord_x = origin_x + (actual_c * payload.step_x)
                coord_y = origin_y + (r * payload.step_y)
                filename = f"IMG_{timestamp}_{str(idx+1).zfill(4)}.jpg"

                dx = coord_x - last_x
                dy = coord_y - last_y

                # Gerak ABSOLUT ke (origin + offset). Origin = posisi motor saat
                # scan dimulai, jadi tidak pernah menuju 0,0.
                if dx != 0.0 or dy != 0.0:
                    await redis.publish("hardware_commands", json.dumps({
                        "action": "MOVE_MOTOR",
                        "gcode": f"G1 X{coord_x:.3f} Y{coord_y:.3f} F250.0"
                    }))

                # Hitung jarak tempuh untuk sinkronisasi waktu nyata
                distance = math.sqrt(dx**2 + dy**2)
                travel_time = distance / feed_rate_mm_per_sec if distance > 0 else 0
                
                # Simpan posisi target absolut
                last_x, last_y = coord_x, coord_y
                
                # 2. Tunggu motor bergerak + delay kamera (settle time)
                base_delay = max(0.5, travel_time) + (payload.delay_ms / 1000.0)
                
                # JIKA ini adalah pergantian baris (Sumbu Y bergerak), beri waktu ekstra 1.0 detik agar getaran CNC reda
                if c == 0 and r > 0:
                    base_delay += 1.0
                    
                await asyncio.sleep(base_delay)
                
                # Hapus file gambar lama jika ada agar Jetson (atau Mock) menimpanya
                file_path = os.path.join(UPLOAD_DIR, filename)
                if os.path.exists(file_path):
                    os.remove(file_path)

                # 3. Perintahkan Edge Device (Jetson) untuk memotret dan menyimpan ke memori lokal
                await redis.publish("hardware_commands", json.dumps({
                    "action": "CAPTURE_IMAGE",
                    "filename": filename
                }))
                
                # Beri jeda proses untuk Jetson memotret (dipercepat dari 2.0 -> 0.5 detik)
                await asyncio.sleep(0.5)
                
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

                # Progress NYATA per-tile -> frontend menggerakkan bar dari sini,
                # bukan dari perkiraan waktu buta.
                await redis.publish("microscope_scan_progress", json.dumps({
                    "event": "SCAN_PROGRESS",
                    "index": idx,
                    "total": total_tiles,
                    "filename": filename,
                    "coordX": round(coord_x, 2),
                    "coordY": round(coord_y, 2)
                }))

        await redis.publish("microscope_scan_progress", json.dumps({
            "event": "SCAN_COMPLETE", "total": len(images)
        }))
    except Exception as exc:
        try:
            await redis.publish("microscope_scan_progress", json.dumps({
                "event": "SCAN_FAILED", "detail": str(getattr(exc, "detail", exc))
            }))
        except Exception:
            pass
        raise
    finally:
        # Kembalikan ke Absolute Mode setelah scan selesai
        await redis.publish("hardware_commands", json.dumps({
            "action": "MOVE_MOTOR",
            "gcode": "G90"
        }))
        await redis.close()

    return {"status": "SUCCESS", "images": images}

@router.post("/scan/retake")
async def retake_grid_image(payload: RetakePayload):
    if not hardware_bus_enabled:
        raise HTTPException(status_code=503, detail="Hardware bus sedang nonaktif.")

    redis = await get_redis_client(REDIS_URL)
    print(f"DEBUG RETAKE: motor_driver ID is {id(motor_driver)}, jetson is {motor_driver.jetson_websocket}", flush=True)
    try:
        # 1. Gerakkan motor ke koordinat Retake — TANPA absolute move ke koordinat
        #    mentah (bisa jadi 0,0 dan bikin CNC "homing"). Kalau posisi live Edge
        #    diketahui, hitung delta lalu gerak RELATIF; kalau tidak, jepret di
        #    tempat (user biasanya sudah memposisikan head secara manual).
        edge_pos = motor_driver.last_edge_position
        if edge_pos is not None:
            ddx = payload.coord_x - edge_pos["X"]
            ddy = payload.coord_y - edge_pos["Y"]
            if abs(ddx) > 1e-4 or abs(ddy) > 1e-4:
                await redis.publish("hardware_commands", json.dumps({"action": "MOVE_MOTOR", "gcode": "G91"}))
                await asyncio.sleep(0.05)
                await redis.publish("hardware_commands", json.dumps({
                    "action": "MOVE_MOTOR",
                    "gcode": f"G1 X{ddx:.3f} Y{ddy:.3f} F250.0"
                }))
                await asyncio.sleep(0.05)
                await redis.publish("hardware_commands", json.dumps({"action": "MOVE_MOTOR", "gcode": "G90"}))
        else:
            print("[RETAKE] Posisi live Edge tidak diketahui — memotret di posisi saat ini tanpa menggerakkan motor.")

        # 2. Tunggu stabilitas mekanik
        await asyncio.sleep(2.5 + (payload.delay_ms / 1000.0))
        
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
                # Simpan posisi fisik terakhir Jetson untuk dipakai sebagai titik
                # awal grid scan (mencegah CNC balik ke origin / terlihat homing).
                pos = data.get("position")
                if isinstance(pos, dict):
                    try:
                        motor_driver.last_edge_position = {
                            "X": float(pos.get("X", 0.0)),
                            "Y": float(pos.get("Y", 0.0)),
                            "Z": float(pos.get("Z", 0.0)),
                        }
                    except (TypeError, ValueError):
                        pass
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


class RoomManager:
    def __init__(self):
        self.pilot = None # dict: {"ws": websocket, "username": str, "role": str, "last_activity": float}
        self.spectators = [] # list of dicts
        self.queue = [] # list of dicts
        self.lock = asyncio.Lock()
        
    async def get_state_payload(self):
        return {
            "event": "ROOM_STATE_UPDATE",
            "pilot": {"username": self.pilot["username"], "ip": self.pilot.get("ip"), "cid": self.pilot.get("cid")} if self.pilot else None,
            "spectators": [{"username": s["username"], "ip": s.get("ip"), "cid": s.get("cid")} for s in self.spectators],
            "queue": [{"username": q["username"], "ip": q.get("ip"), "cid": q.get("cid")} for q in self.queue]
        }
        
    async def broadcast_state(self):
        payload = json.dumps(await self.get_state_payload())
        if self.pilot:
            try:
                await self.pilot["ws"].send_text(payload)
            except Exception:
                pass
        for s in self.spectators:
            try:
                await s["ws"].send_text(payload)
            except Exception:
                pass
        for q in self.queue:
            try:
                await q["ws"].send_text(payload)
            except Exception:
                pass

    def get_user_connection_count(self, username: str) -> int:
        count = 0
        if self.pilot and self.pilot["username"] == username: count += 1
        count += sum(1 for s in self.spectators if s["username"] == username)
        count += sum(1 for q in self.queue if q["username"] == username)
        return count

    async def connect(self, websocket: WebSocket, username: str, role: str):
        # websocket.accept() sudah dilakukan di client_websocket_endpoint.
        async with self.lock:
            if self.get_user_connection_count(username) >= 3:
                try:
                    await websocket.send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "MAX_DEVICES_REACHED"}))
                    await websocket.close(code=1008)
                except Exception:
                    pass
                return None
                
            cid = str(uuid.uuid4())
            ip = websocket.client.host if websocket.client else "Unknown"
            user_data = {"ws": websocket, "username": username, "role": role, "last_activity": time.time(), "ip": ip, "cid": cid}
            assigned_role = ""
            
            if self.pilot is None:
                self.pilot = user_data
                assigned_role = "PILOT"
            elif len(self.spectators) < 2:
                self.spectators.append(user_data)
                assigned_role = "SPECTATOR"
            else:
                self.queue.append(user_data)
                assigned_role = "QUEUED"
        
        try:
            await websocket.send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": assigned_role}))
        except Exception:
            pass
            
        async with self.lock:
            await self.broadcast_state()
            
        return user_data

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            found = False
            if self.pilot and self.pilot["ws"] == websocket:
                self.pilot = None
                found = True
            else:
                for u in self.spectators:
                    if u["ws"] == websocket:
                        self.spectators.remove(u)
                        found = True
                        break
                if not found:
                    for u in self.queue:
                        if u["ws"] == websocket:
                            self.queue.remove(u)
                            found = True
                            break

            if not found:
                return

            if self.pilot is None and self.spectators:
                self.pilot = self.spectators.pop(0)
                try:
                    await self.pilot["ws"].send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "PILOT"}))
                except Exception:
                    pass
            
            while len(self.spectators) < 2 and self.queue:
                q = self.queue.pop(0)
                q["last_activity"] = time.time()
                self.spectators.append(q)
                try:
                    await q["ws"].send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "SPECTATOR"}))
                except Exception:
                    pass
                    
            await self.broadcast_state()

    async def takeover(self, websocket: WebSocket):
        async with self.lock:
            admin_user = None
            if self.pilot and self.pilot["ws"] == websocket:
                return
            
            for u in self.spectators:
                if u["ws"] == websocket:
                    admin_user = u
                    break
            if not admin_user:
                for u in self.queue:
                    if u["ws"] == websocket:
                        admin_user = u
                        break
                        
            if admin_user and admin_user["role"].upper() == "ADMIN":
                self.spectators = [u for u in self.spectators if u["ws"] != websocket]
                self.queue = [u for u in self.queue if u["ws"] != websocket]
                
                old_pilot = self.pilot
                self.pilot = admin_user
                
                try:
                    await self.pilot["ws"].send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "PILOT"}))
                except Exception:
                    pass
                
                if old_pilot:
                    if len(self.spectators) < 2:
                        self.spectators.append(old_pilot)
                        try:
                            await old_pilot["ws"].send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "SPECTATOR"}))
                        except Exception:
                            pass
                    else:
                        self.queue.insert(0, old_pilot)
                        try:
                            await old_pilot["ws"].send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "QUEUED"}))
                        except Exception:
                            pass
                            
            await self.broadcast_state()

    async def admin_action(self, cid: str, action: str):
        target_ws = None
        target_user = None
        
        async with self.lock:
            if self.pilot and self.pilot.get("cid") == cid:
                target_user = self.pilot
            else:
                for s in self.spectators:
                    if s.get("cid") == cid:
                        target_user = s
                        break
                if not target_user:
                    for q in self.queue:
                        if q.get("cid") == cid:
                            target_user = q
                            break
                            
            if not target_user:
                return False
                
            target_ws = target_user["ws"]
            
        if action == "KICK":
            try:
                await target_ws.send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "KICKED_BY_ADMIN"}))
                await target_ws.close(code=1008)
            except Exception:
                pass
            await self.disconnect(target_ws)
            return True
            
        elif action == "MAKE_PILOT":
            # Pindahkan ke antrian terdepan dan lakukan takeover
            async with self.lock:
                if target_user in self.spectators:
                    self.spectators.remove(target_user)
                    self.queue.insert(0, target_user)
                elif target_user in self.queue:
                    self.queue.remove(target_user)
                    self.queue.insert(0, target_user)
                    
            if target_ws:
                await self.takeover(target_ws)
            return True
            
        return False

    def get_role(self, websocket: WebSocket) -> str:
        if self.pilot and self.pilot["ws"] == websocket: return "PILOT"
        for s in self.spectators:
            if s["ws"] == websocket: return "SPECTATOR"
        for q in self.queue:
            if q["ws"] == websocket: return "QUEUED"
        return "DISCONNECTED"
        
    def update_activity(self, websocket: WebSocket):
        if self.pilot and self.pilot["ws"] == websocket:
            self.pilot["last_activity"] = time.time()
        for s in self.spectators:
            if s["ws"] == websocket: s["last_activity"] = time.time()
        for q in self.queue:
            if q["ws"] == websocket: q["last_activity"] = time.time()
            
    async def idle_timeout_check(self):
        while True:
            await asyncio.sleep(10)
            now = time.time()
            to_disconnect = []
            
            async with self.lock:
                if self.pilot and (now - self.pilot["last_activity"] > 600):
                    to_disconnect.append(self.pilot["ws"])
                for s in self.spectators:
                    if (now - s["last_activity"] > 600): to_disconnect.append(s["ws"])
                for q in self.queue:
                    if (now - q["last_activity"] > 600): to_disconnect.append(q["ws"])
                    
            for ws in to_disconnect:
                try:
                    await ws.send_text(json.dumps({"event": "ROLE_ASSIGNED", "role": "IDLE_TIMEOUT"}))
                    await ws.close(code=1000)
                except Exception:
                    pass

room_manager = RoomManager()

@router.on_event("startup")
async def startup_event():
    asyncio.create_task(room_manager.idle_timeout_check())

# ====================================================================
# 3. WEBSOCKET KHUSUS CLIENT CLIENT (BROWSER REACT)
# ====================================================================
@router.websocket("/client/ws")
async def client_websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    """Endpoint tempat browser user (React) terhubung untuk memantau & mengontrol instrumen."""
    # Terima handshake DULU, baru validasi token. Kalau ditolak sebelum accept(),
    # browser hanya melihat kegagalan generik (close code 1006) dan tak bisa
    # membedakan "token kadaluarsa" dari "jaringan putus". Dengan accept lebih
    # dulu, kita bisa menutup memakai kode khusus 4001 yang dibaca frontend.
    await websocket.accept()

    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub", "Unknown")
        role = payload.get("role", "user")
    except JWTError:
        print("[VPS CLIENT] Koneksi ditolak: token JWT kadaluarsa / tidak valid.")
        await websocket.close(code=4001)
        return

    redis = await get_redis_client(REDIS_URL)
    user_data = await room_manager.connect(websocket, username, role)
    if user_data is None:
        return
    print(f"[VPS CLIENT] Browser user {username} ({role}) terhubung ke sirkuit interaktif.")

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
        await pubsub.subscribe("microscope_video_stream", "microscope_telemetry", "microscope_scan_progress")
        try:
            async for message in pubsub.listen():
                if message.get('type') == 'message':
                    msg_text = message['data'].decode('utf-8')
                    is_video = "STREAM_DATA" in msg_text
                    role = room_manager.get_role(websocket)
                    
                    # Hanya broadcast STREAM_DATA ke Pilot & Spectator (Hemat Bandwidth)
                    if is_video and role == "QUEUED":
                        continue
                        
                    await websocket.send_text(msg_text)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe("microscope_video_stream", "microscope_telemetry", "microscope_scan_progress")
            await pubsub.close()

    # Jalankan pendengar siaran Redis di background task
    broadcast_task = asyncio.create_task(listen_to_redis_broadcast())
    
    try:
        # 🟢 TASK B: Jalankan antrean penerima instruksi dari Browser React
        while True:
            client_msg = await websocket.receive_text()
            room_manager.update_activity(websocket)
            try:
                data = json.loads(client_msg)
                if data.get("action") == "TAKEOVER":
                    await room_manager.takeover(websocket)
                    continue
                if data.get("action") == "PING":
                    continue
            except json.JSONDecodeError:
                pass
                
            # Lempar perintah dari browser langsung ke channel instruksi mekatronika
            await redis.publish("hardware_commands", client_msg)

    except WebSocketDisconnect:
        print(f"[VPS CLIENT] Hubungan Browser user {username} terputus dari sirkuit.")
    finally:
        # PENTING: Bersihkan alokasi kursi untuk menghindari sesi hantu
        await room_manager.disconnect(websocket)
        print(f"[VPS CLIENT] Sesi user {username} telah dilepas sepenuhnya.")
        
        # Stop background broadcast task
        if 'broadcast_task' in locals() and not broadcast_task.done():
            broadcast_task.cancel()
            try:
                await broadcast_task
            except asyncio.CancelledError:
                pass
        await redis.close()