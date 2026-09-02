"""
=============================================================
FILE PENGUJIAN WHITE BOX - SISTEM MIKROSKOP DIGITAL
Menggunakan: Pytest + FastAPI TestClient
=============================================================
Cara menjalankan:
    .\\venv\\Scripts\\python.exe -m pytest test_api.py -v
Dengan coverage:
    .\\venv\\Scripts\\python.exe -m pytest test_api.py --cov=app --cov-report=term-missing --cov-branch -v
"""
import io
import random
import time
import uuid

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.services.auth_service import hash_password, verify_password, create_access_token

client = TestClient(app)

# Penyimpanan state ringan antar-test dalam satu kategori (folder id, dsb.)
# — bukan fixture pytest, sengaja dibuat sederhana mengikuti gaya file ini.
_shared = {}


def _make_test_image_bytes(color=(100, 150, 200)):
    """Membuat citra JPEG kecil secara in-memory (tanpa file fisik) untuk uji unggah/analisis."""
    img = np.zeros((60, 60, 3), dtype=np.uint8)
    img[:] = color
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return io.BytesIO(buf.tobytes())


def _ensure_hardware_bus_enabled():
    client.post("/api/hardware/bus/toggle", json={"enabled": True})


# ============================================================
# KATEGORI A: UNIT TEST - LAYANAN AUTENTIKASI (auth_service.py)
# ============================================================

def test_unit_A1_hash_password_berubah():
    """
    A1: Password asli harus diubah menjadi string acak (hash) oleh bcrypt.
    Branch Coverage: jalur hashing normal.
    """
    password = "password_lab_2025"
    hashed = hash_password(password)
    assert hashed != password  # Harus berbeda dari aslinya

def test_unit_A2_verify_password_cocok():
    """
    A2: Fungsi verify harus mengembalikan True jika password cocok dengan hash-nya.
    Branch Coverage: cabang True pada bcrypt.checkpw.
    """
    password = "password_lab_2025"
    hashed = hash_password(password)
    assert verify_password(password, hashed) == True

def test_unit_A3_verify_password_salah():
    """
    A3: Fungsi verify harus mengembalikan False jika password TIDAK cocok.
    Branch Coverage: cabang False pada bcrypt.checkpw.
    """
    password_asli = "password_benar"
    hashed = hash_password(password_asli)
    assert verify_password("password_salah", hashed) == False

def test_unit_A4_token_jwt_terbentuk():
    """
    A4: Fungsi create_access_token harus menghasilkan string JWT yang tidak kosong.
    Statement Coverage: seluruh baris fungsi create_access_token tereksekusi.
    """
    token = create_access_token(data={"sub": "operator_uji", "role": "OPERATOR"})
    assert token is not None
    assert len(token) > 20  # Token JWT pasti panjang


# ============================================================
# KATEGORI B: FEATURE TEST - ENDPOINT AUTENTIKASI
# ============================================================

def test_feature_B1_health_check():
    """
    B1: Root endpoint "/" harus merespons 200 OK dan status ONLINE.
    Statement Coverage: memastikan server hidup dan konfigurasi router terdaftar.
    """
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ONLINE"

def test_feature_B2_login_kredensial_salah():
    """
    B2: Login dengan password salah harus ditolak (HTTP 401).
    Branch Coverage: cabang "not user or not verify_password" di auth.py terpenuhi.
    """
    response = client.post("/api/auth/login", json={
        "username": "user_tidak_ada_di_db",
        "password": "password_ngasal_123"
    })
    assert response.status_code == 401

def test_feature_B3_registrasi_user_baru():
    """
    B3: Registrasi username baru harus berhasil (HTTP 201).
    Statement Coverage: alur pembuatan user baru di database tereksekusi.
    """
    username_unik = f"operator_tes_{random.randint(1000, 9999)}"
    response = client.post("/api/auth/register", json={
        "username": username_unik,
        "password": "test_password"
    })
    assert response.status_code == 201
    assert "username" in response.json()

def test_feature_B4_registrasi_username_duplikat():
    """
    B4: Mendaftarkan username yang sudah ada harus gagal (HTTP 400).
    Branch Coverage: cabang "if existing_user" di auth.py terpenuhi.
    """
    # Daftarkan pertama kali
    client.post("/api/auth/register", json={
        "username": "operator_duplikat_fix",
        "password": "test123"
    })
    # Coba daftarkan lagi dengan username yang sama
    response = client.post("/api/auth/register", json={
        "username": "operator_duplikat_fix",
        "password": "test123"
    })
    assert response.status_code == 400


# ============================================================
# KATEGORI C: FEATURE TEST - ENDPOINT HARDWARE (INTI)
# ============================================================

def test_feature_C1_telemetry_stats_tersedia():
    """
    C1: Endpoint telemetri harus bisa diakses dan mengembalikan data statistik server.
    Statement Coverage: seluruh baris fungsi get_telemetry_stats() tereksekusi.
    """
    response = client.get("/api/hardware/telemetry/stats")
    assert response.status_code == 200
    data = response.json()
    assert "serverCpu" in data
    assert "serverRam" in data
    assert "hardwareBus" in data

def test_feature_C2_hardware_bus_dinonaktifkan():
    """
    C2: Menonaktifkan hardware bus harus berhasil dan memblokir perintah motor.
    Branch Coverage: cabang "if not hardware_bus_enabled" pada motor/move terpenuhi.
    """
    # Matikan hardware bus
    client.post("/api/hardware/bus/toggle", json={"enabled": False})

    # Coba kirim perintah motor saat bus mati
    response = client.post("/api/hardware/motor/move", json={
        "axis": "X", "value": 10.0, "feed_rate": 200.0, "unit": "mm"
    })
    assert response.status_code == 503  # Service Unavailable

    # Hidupkan kembali hardware bus setelah pengujian
    client.post("/api/hardware/bus/toggle", json={"enabled": True})

def test_feature_C3_scan_status_awal():
    """
    C3: Status grid scan di awal harus dalam kondisi tidak berjalan (running = False).
    Statement Coverage: memastikan state awal sistem scan tereksekusi dengan benar.
    """
    response = client.get("/api/hardware/scan/status")
    assert response.status_code == 200
    assert response.json()["running"] == False


# ============================================================
# KATEGORI D: FEATURE TEST - MANAJEMEN DATASET (dataset.py)
# ============================================================

def test_feature_D01_create_folder_berhasil():
    """D01: Membuat folder dataset baru harus berhasil (201) dan tersimpan di DB."""
    nama_unik = f"folder_uji_{uuid.uuid4().hex[:8]}"
    response = client.post("/api/dataset/folders", json={
        "name": nama_unik, "object_type": "Bakteri Uji", "date": "2026-09-02", "operator": "pytest"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == nama_unik
    _shared["folder_id"] = data["id"]
    _shared["folder_name"] = nama_unik

def test_feature_D02_create_folder_nama_duplikat():
    """D02: Membuat folder dengan nama yang sudah dipakai harus gagal (400)."""
    response = client.post("/api/dataset/folders", json={
        "name": _shared["folder_name"], "object_type": "Bakteri Uji", "date": "2026-09-02", "operator": "pytest"
    })
    assert response.status_code == 400

def test_feature_D03_get_all_folders():
    """D03: Daftar folder harus dapat diambil dan memuat folder yang baru dibuat."""
    response = client.get("/api/dataset/folders")
    assert response.status_code == 200
    ids = [f["id"] for f in response.json()]
    assert _shared["folder_id"] in ids

def test_feature_D04_update_folder_metadata():
    """D04: Metadata folder (nama/tipe objek/operator) harus dapat diperbarui."""
    response = client.put(f"/api/dataset/folders/{_shared['folder_id']}", json={
        "name": _shared["folder_name"], "object_type": "Bakteri Uji (Revisi)", "operator": "pytest_revisi"
    })
    assert response.status_code == 200
    assert response.json()["object_type"] == "Bakteri Uji (Revisi)"

def test_feature_D05_update_folder_tidak_ditemukan():
    """D05: Memperbarui folder dengan id yang tidak ada harus mengembalikan 404."""
    response = client.put("/api/dataset/folders/id_tidak_ada", json={
        "name": "x", "object_type": "x", "operator": "x"
    })
    assert response.status_code == 404

def test_feature_D06_upload_files_ke_folder():
    """D06: Mengunggah citra ke folder harus menambah image_count folder tersebut."""
    files = {"files": ("sample.jpg", _make_test_image_bytes(), "image/jpeg")}
    response = client.post(f"/api/dataset/folders/{_shared['folder_id']}/files", files=files)
    assert response.status_code == 200
    assert response.json()["current_image_count"] >= 1

def test_feature_D07_get_folder_images():
    """D07: Daftar citra dalam folder harus memuat citra yang baru diunggah."""
    response = client.get(f"/api/dataset/folders/{_shared['folder_id']}/images")
    assert response.status_code == 200
    names = [img["name"] for img in response.json()]
    assert "sample.jpg" in names

def test_feature_D08_download_single_file():
    """D08: Mengunduh satu citra tertentu dari folder harus berhasil (200)."""
    response = client.get(f"/api/dataset/folders/{_shared['folder_id']}/files/sample.jpg/download")
    assert response.status_code == 200

def test_feature_D09_get_storage_info():
    """D09: Info kapasitas penyimpanan harus tersedia dengan field yang benar."""
    response = client.get("/api/dataset/storage-info")
    assert response.status_code == 200
    data = response.json()
    assert "total_gb" in data and "used_gb" in data

def test_feature_D10_get_vps_sync_index():
    """D10: Index sinkronisasi VPS<->Edge harus memuat folder yang ada."""
    response = client.get("/api/dataset/vps/sync-index")
    assert response.status_code == 200
    assert _shared["folder_id"] in response.json()["folders"]

def test_feature_D11_download_folder_zip():
    """D11: Folder berisi citra harus dapat diunduh sebagai satu arsip ZIP."""
    response = client.get(f"/api/dataset/folders/{_shared['folder_id']}/download")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

def test_feature_D12_delete_images_in_folder():
    """D12: Menghapus citra tertentu dari folder harus mengurangi image_count."""
    response = client.request(
        "DELETE", f"/api/dataset/folders/{_shared['folder_id']}/images",
        json={"filenames": ["sample.jpg"]}
    )
    assert response.status_code == 200
    assert response.json()["current_image_count"] == 0

def test_feature_D13_delete_folder():
    """D13: Menghapus folder dataset (beserta metadata & file fisiknya) harus berhasil."""
    response = client.delete(f"/api/dataset/folders/{_shared['folder_id']}")
    assert response.status_code == 200

def test_feature_D14_delete_folder_tidak_ditemukan():
    """D14: Menghapus folder yang tidak ada harus mengembalikan 404."""
    response = client.delete(f"/api/dataset/folders/{_shared['folder_id']}")
    assert response.status_code == 404


# ============================================================
# KATEGORI E: FEATURE TEST - ANALISIS CITRA (analysis.py)
# Edge Device offline pada lingkungan pengujian -> menempuh jalur
# FALLBACK process_locally() (OpenCV murni), sehingga tetap dapat
# diuji end-to-end tanpa perangkat keras fisik.
# ============================================================

def test_feature_E01_upload_image_for_analysis():
    """E01: Mengunggah citra untuk dianalisis harus berhasil dan mengembalikan nama file server."""
    files = {"file": ("analisis.jpg", _make_test_image_bytes(), "image/jpeg")}
    response = client.post("/api/analysis/upload", files=files)
    assert response.status_code == 200
    _shared["analysis_filename"] = response.json()["filename"]

def test_feature_E02_apply_tool_nama_tidak_dikenal():
    """E02: Memanggil tool analisis dengan nama tak dikenal harus gagal (400)."""
    response = client.post("/api/analysis/nama-tool-ngasal", json={
        "filename": _shared["analysis_filename"], "current_src": "", "params": {}
    })
    assert response.status_code == 400

def test_feature_E03_apply_tool_adaptive_threshold_fallback_lokal():
    """E03: Tool adaptive-thresh harus berhasil diproses via fallback lokal (Edge offline)."""
    response = client.post("/api/analysis/adaptive-thresh", json={
        "filename": _shared["analysis_filename"], "current_src": "", "params": {"blockSize": 11, "C": 2}
    })
    assert response.status_code == 200
    assert response.json()["processed_by"] == "server (edge offline)"

def test_feature_E04_apply_tool_colony_count_fallback_lokal():
    """E04: Tool colony-count harus berhasil diproses via fallback lokal dan mengembalikan jumlah koloni."""
    response = client.post("/api/analysis/colony-count", json={
        "filename": _shared["analysis_filename"], "current_src": "", "params": {}
    })
    assert response.status_code == 200
    assert "colonies" in response.json()

def test_feature_E05_apply_tool_file_tidak_ditemukan():
    """E05: Menerapkan tool pada file yang tidak ada di server harus mengembalikan 404."""
    response = client.post("/api/analysis/adaptive-thresh", json={
        "filename": "file_yang_tidak_pernah_ada.jpg", "current_src": "", "params": {}
    })
    assert response.status_code == 404


# ============================================================
# KATEGORI F: FEATURE TEST - PEMBUATAN LAPORAN (documentation.py)
# Menggunakan folder dataset baru (independen dari Kategori D yang
# sudah menghapus foldernya) supaya galeri laporan tidak kosong.
# ============================================================

def test_feature_F00_setup_folder_untuk_laporan():
    """F00 (setup): Buat folder + unggah 1 citra khusus untuk pengujian laporan."""
    nama_unik = f"folder_laporan_{uuid.uuid4().hex[:8]}"
    resp = client.post("/api/dataset/folders", json={
        "name": nama_unik, "object_type": "Bakteri Uji", "date": "2026-09-02", "operator": "pytest"
    })
    assert resp.status_code == 201
    _shared["report_folder_id"] = resp.json()["id"]
    files = {"files": ("laporan.jpg", _make_test_image_bytes(), "image/jpeg")}
    client.post(f"/api/dataset/folders/{_shared['report_folder_id']}/files", files=files)

def test_feature_F01_generate_report_word():
    """F01: Membuat laporan format Word harus menghasilkan file .docx (200)."""
    response = client.post(
        "/api/documentation/generate?format=WORD",
        json={"folder_id": _shared["report_folder_id"], "author": "Pytest"}
    )
    assert response.status_code == 200

def test_feature_F02_generate_report_excel():
    """F02: Membuat laporan format Excel harus menghasilkan file .xlsx (200)."""
    response = client.post(
        "/api/documentation/generate?format=EXCEL",
        json={"folder_id": _shared["report_folder_id"], "author": "Pytest"}
    )
    assert response.status_code == 200

def test_feature_F03_generate_report_ppt():
    """F03: Membuat laporan format PowerPoint harus menghasilkan file .pptx (200)."""
    response = client.post(
        "/api/documentation/generate?format=PPT",
        json={"folder_id": _shared["report_folder_id"], "author": "Pytest"}
    )
    assert response.status_code == 200

def test_feature_F04_generate_report_format_tidak_dikenal():
    """F04: Format laporan yang tidak dikenali harus ditolak (400)."""
    response = client.post(
        "/api/documentation/generate?format=XML",
        json={"folder_id": _shared["report_folder_id"], "author": "Pytest"}
    )
    assert response.status_code == 400

def test_feature_F99_cleanup_folder_laporan():
    """F99 (cleanup): Hapus folder yang dipakai khusus untuk pengujian laporan."""
    response = client.delete(f"/api/dataset/folders/{_shared['report_folder_id']}")
    assert response.status_code == 200


# ============================================================
# KATEGORI G: FEATURE TEST - HARDWARE LANJUTAN (hardware.py)
# Edge Device offline -> instruksi kendali diteruskan tapi mengembalikan
# status "Edge Device Offline" pada grbl_response; ini memvalidasi jalur
# API/guard, bukan gerakan motor fisik (itu ranah pengujian hardware).
# ============================================================

def test_feature_G01_get_system_config():
    """G01: Endpoint konfigurasi sistem tersimpan harus dapat diakses."""
    response = client.get("/api/hardware/config")
    assert response.status_code == 200

def test_feature_G02_set_ai_config():
    """G02: Mengatur ambang keyakinan AI (confThreshold) harus tersimpan."""
    response = client.put("/api/hardware/config/ai", json={"confThreshold": 40})
    assert response.status_code == 200
    assert response.json()["confThreshold"] == 40

def test_feature_G03_reset_config_default():
    """G03: Mereset konfigurasi section 'cnc' ke default harus berhasil."""
    response = client.post("/api/hardware/config/cnc/default")
    assert response.status_code == 200

def test_feature_G04_apply_camera_settings():
    """G04: Menerapkan pengaturan kamera (shutter/ISO) saat hardware bus aktif harus berhasil."""
    _ensure_hardware_bus_enabled()
    response = client.post("/api/hardware/camera/settings", json={"shutter_speed": 5000, "iso": 400})
    assert response.status_code == 200

def test_feature_G05_apply_cnc_settings():
    """G05: Menerapkan pengaturan CNC (feed rate/backlash/dll) saat hardware bus aktif harus berhasil."""
    response = client.post("/api/hardware/cnc/settings", json={
        "feed_rate": 250.0, "backlash": 0.1, "acceleration": 500.0, "settle_time": 300
    })
    assert response.status_code == 200

def test_feature_G06_apply_soft_limits():
    """G06: Menerapkan batas gerak (soft limit) motor harus tersimpan dan diteruskan ke Edge."""
    response = client.post("/api/hardware/cnc/soft-limits", json={
        "enabled": True, "x_min": 0, "x_max": 100, "y_min": 0, "y_max": 100
    })
    assert response.status_code == 200

def test_feature_G07_motor_home():
    """G07: Perintah homing motor harus diterima API (respons 200) walau Edge offline."""
    response = client.post("/api/hardware/motor/home")
    assert response.status_code == 200

def test_feature_G08_motor_unlock():
    """G08: Perintah unlock GRBL harus diterima API (respons 200) walau Edge offline."""
    response = client.post("/api/hardware/motor/unlock")
    assert response.status_code == 200

def test_feature_G09_motor_set_position():
    """G09: Menulis ulang koordinat kerja (tanpa menggerakkan motor) harus berhasil."""
    response = client.post("/api/hardware/motor/set-position", json={"x": 0, "y": 0, "z": 0})
    assert response.status_code == 200

def test_feature_G10_edge_restart_jetson_offline():
    """G10: Merestart layanan Edge saat Jetson offline harus ditolak (409), bukan error senyap."""
    response = client.post("/api/hardware/edge/restart")
    assert response.status_code == 409

def test_feature_G11_scan_grid_start_dan_cancel():
    """G11: Memulai grid scan harus langsung merespons STARTED, lalu dapat dibatalkan."""
    start = client.post("/api/hardware/scan/grid", json={
        "columns": 2, "rows": 2, "step_x": 1.0, "step_y": 1.0,
        "delay_ms": 100, "unit": "mm", "start_x": 0.0, "start_y": 0.0
    })
    assert start.status_code == 200
    assert start.json()["status"] == "STARTED"
    cancel = client.post("/api/hardware/scan/cancel")
    assert cancel.status_code == 200

def test_feature_G12_stitch_start_dan_status():
    """G12: Memulai proses stitching harus merespons STARTED dan status dapat dipantau."""
    start = client.post("/api/hardware/stitch", json={"images": [], "tiles": [], "session": "pytest-session"})
    assert start.status_code == 200
    status = client.get("/api/hardware/stitch/status")
    assert status.status_code == 200

def test_feature_G13_room_admin_action_sesi_tidak_ada():
    """G13: Aksi admin (mis. KICK) pada connection id yang tidak ada harus mengembalikan 404."""
    response = client.post("/api/hardware/room/admin_action", json={
        "cid": "cid-tidak-pernah-ada", "action": "KICK"
    })
    assert response.status_code == 404


# ============================================================
# KATEGORI H: FEATURE TEST - SIKLUS RBAC OPERATOR (auth.py lanjutan)
# Satu skenario berurutan: registrasi -> ganti password sendiri ->
# ubah peran oleh Admin -> reset password oleh Admin -> hapus akun.
# ============================================================

def test_feature_H01_lifecycle_rbac_operator():
    """H01: Siklus penuh manajemen operator: registrasi, ganti password mandiri,
    ubah peran, reset password oleh Admin, dan penghapusan akun."""
    username = f"operator_rbac_{uuid.uuid4().hex[:8]}"
    original_password = "PasswordAwal123"

    # Registrasi
    reg = client.post("/api/auth/register", json={"username": username, "password": original_password})
    assert reg.status_code == 201

    # Cari id operator yang baru dibuat
    operators = client.get("/api/auth/operators").json()
    match = [o for o in operators if o["username"] == username]
    assert len(match) == 1
    user_id = match[0]["id"]

    # Ganti password sendiri (pakai password asli)
    change = client.put("/api/auth/profile/password", json={
        "username": username, "old_password": original_password, "new_password": "PasswordBaru456"
    })
    assert change.status_code == 200

    # Ubah peran oleh Admin
    role_update = client.put(f"/api/auth/operators/{user_id}/role", json={"role": "ADMIN"})
    assert role_update.status_code == 200

    # Reset password oleh Admin
    reset = client.put("/api/auth/reset-password", json={"user_id": user_id})
    assert reset.status_code == 200

    # Hapus akun (cleanup)
    delete = client.delete(f"/api/auth/operators/{user_id}")
    assert delete.status_code == 200

def test_feature_H02_ganti_password_sendiri_salah():
    """H02: Ganti password sendiri dengan password lama yang salah harus ditolak (401)."""
    username = f"operator_h02_{uuid.uuid4().hex[:8]}"
    client.post("/api/auth/register", json={"username": username, "password": "PasswordAsli"})
    response = client.put("/api/auth/profile/password", json={
        "username": username, "old_password": "PasswordSalah", "new_password": "Baru123"
    })
    assert response.status_code == 401
    # cleanup
    operators = client.get("/api/auth/operators").json()
    match = [o for o in operators if o["username"] == username]
    if match:
        client.delete(f"/api/auth/operators/{match[0]['id']}")


# ============================================================
# KATEGORI I: FEATURE TEST - LOG AKTIVITAS (logs.py lanjutan)
# ============================================================

def test_feature_I01_create_log():
    """I01: Mencatat entri log aktivitas baru secara manual harus berhasil (200)."""
    response = client.post("/api/logs", json={
        "operator": "pytest", "action": "Pengujian white box otomatis", "status": "SUCCESS"
    })
    assert response.status_code == 200
    assert response.json()["operator"] == "pytest"


# ============================================================
# KATEGORI K: FEATURE TEST - WEBSOCKET KLIEN (/api/hardware/client/ws)
# Menguji RoomManager (concurrency lock) secara end-to-end lewat koneksi
# WebSocket nyata, bukan cuma memeriksa method-nya secara terisolasi.
# ============================================================

def _login_get_token(username: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def _register_and_login(prefix: str) -> str:
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    password = "Pass123!"
    reg = client.post("/api/auth/register", json={"username": username, "password": password})
    assert reg.status_code == 201
    return _login_get_token(username, password)

def test_feature_K01_client_ws_tanpa_token_ditolak():
    """K01: Koneksi WebSocket klien tanpa token harus ditutup dengan close code 4001."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/api/hardware/client/ws") as ws:
            ws.receive_text()
    assert exc_info.value.code == 4001

def test_feature_K02_client_ws_token_tidak_valid_ditolak():
    """K02: Koneksi WebSocket klien dengan token JWT tidak valid harus ditutup (4001)."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/api/hardware/client/ws?token=token-ngasal-tidak-valid") as ws:
            ws.receive_text()
    assert exc_info.value.code == 4001

def test_feature_K03_client_ws_pilot_lalu_spectator():
    """K03: Koneksi pertama harus mendapat peran PILOT, koneksi kedua (user lain)
    harus mendapat peran SPECTATOR — memvalidasi mekanisme concurrency lock."""
    token1 = _register_and_login("ws_pilot")
    token2 = _register_and_login("ws_spectator")
    with client.websocket_connect(f"/api/hardware/client/ws?token={token1}") as ws1:
        msg1 = ws1.receive_json()
        assert msg1["event"] == "ROLE_ASSIGNED"
        assert msg1["role"] == "PILOT"
        with client.websocket_connect(f"/api/hardware/client/ws?token={token2}") as ws2:
            msg2 = ws2.receive_json()
            assert msg2["role"] == "SPECTATOR"

def _receive_until(ws, predicate, max_tries=6):
    """Terima pesan berturut-turut sampai predicate terpenuhi atau koneksi tertutup.
    Dipakai agar test tahan terhadap pesan tambahan (mis. ROOM_STATE_UPDATE) yang
    bisa menyelip di antara pesan yang benar-benar ingin diperiksa."""
    for _ in range(max_tries):
        try:
            msg = ws.receive_json()
        except WebSocketDisconnect:
            return None
        if predicate(msg):
            return msg
    return None

def test_feature_K04_client_ws_maksimal_3_perangkat_per_user():
    """K04: Perangkat ke-4 dengan username yang SAMA harus ditolak — server mengirim
    pesan MAX_DEVICES_REACHED terlebih dahulu sebelum menutup koneksi (close 1008)."""
    token = _register_and_login("ws_multi")
    url = f"/api/hardware/client/ws?token={token}"
    with client.websocket_connect(url) as ws1:
        ws1.receive_json()
        with client.websocket_connect(url) as ws2:
            ws2.receive_json()
            with client.websocket_connect(url) as ws3:
                ws3.receive_json()
                with client.websocket_connect(url) as ws4:
                    reject_msg = _receive_until(ws4, lambda m: m.get("role") == "MAX_DEVICES_REACHED")
                    assert reject_msg is not None, "Tidak menerima pesan MAX_DEVICES_REACHED"

def test_feature_K05_room_admin_action_kick_sesi_nyata():
    """K05: Memanggil endpoint REST admin_action(KICK) harus benar-benar memutus
    koneksi WebSocket target yang sedang aktif — bukti integrasi REST -> WebSocket."""
    token = _register_and_login("ws_kick")
    with client.websocket_connect(f"/api/hardware/client/ws?token={token}") as ws:
        role_msg = ws.receive_json()
        assert role_msg["role"] == "PILOT"
        state_msg = _receive_until(ws, lambda m: m.get("event") == "ROOM_STATE_UPDATE")
        assert state_msg is not None, "Tidak menerima ROOM_STATE_UPDATE"
        cid = state_msg["pilot"]["cid"]

        response = client.post("/api/hardware/room/admin_action", json={"cid": cid, "action": "KICK"})
        assert response.status_code == 200
        assert response.json()["status"] == "SUCCESS"

        kick_msg = _receive_until(ws, lambda m: m.get("role") == "KICKED_BY_ADMIN")
        assert kick_msg is not None, "Tidak menerima pesan KICKED_BY_ADMIN setelah admin_action"


# ============================================================
# KATEGORI L: FEATURE TEST - WEBSOCKET EDGE DEVICE (/api/hardware/ws)
# Membuktikan register_jetson()/unregister_jetson() benar-benar mengubah
# perilaku endpoint kendali motor secara langsung (bukan cuma unit-level).
# ============================================================

def _move_grbl_response():
    resp = client.post("/api/hardware/motor/move", json={
        "axis": "Z", "value": 1.0, "feed_rate": 100.0, "unit": "mm"
    })
    if resp.status_code == 429:
        return "RATE_LIMITED"  # guard 0.5 detik dari pengujian QoS sebelumnya
    return resp.json()["grbl_response"]

def _wait_until_registered():
    """register_jetson() baru berjalan SETELAH get_redis_client() selesai. Fungsi itu
    melakukan socket.connect() SINKRON (blocking) dengan timeout 2 detik sebelum
    fallback ke MockRedis ketika Redis asli tak ditemukan di REDIS_URL -- temuan
    white-box: event loop tertahan hingga ~2 detik per koneksi Edge baru. Jeda di
    sini sengaja melebihi 2 detik itu, sekaligus tetap menghormati guard rate-limit
    0.5 detik pada motor/move yang sudah diuji pada pengujian QoS sebelumnya."""
    time.sleep(2.3)
    return _move_grbl_response()

def test_feature_L01_edge_ws_registrasi_meneruskan_perintah_motor():
    """L01: Selama Edge terhubung via WebSocket, perintah motor harus diteruskan
    (grbl_response == 'ok'), bukan lagi 'Edge Device Offline'."""
    with client.websocket_connect("/api/hardware/ws"):
        result = _wait_until_registered()
        assert result == "ok"

def test_feature_L02_edge_ws_unregister_setelah_disconnect():
    """L02: Setelah koneksi Edge terputus, perintah motor harus kembali
    melaporkan Edge Device Offline (motor_driver ter-unregister dengan benar)."""
    with client.websocket_connect("/api/hardware/ws"):
        pass  # koneksi langsung ditutup di akhir blok 'with'
    response = client.post("/api/hardware/motor/move", json={
        "axis": "Z", "value": 1.0, "feed_rate": 100.0, "unit": "mm"
    })
    assert response.status_code == 200
    assert "Offline" in response.json()["grbl_response"]

def test_feature_L03_edge_ws_kirim_telemetry_koneksi_tetap_hidup():
    """L03: Edge mengirim event TELEMETRY_DATA harus diproses tanpa memutus koneksi,
    dibuktikan dengan pengiriman event kedua yang masih berhasil setelahnya."""
    with client.websocket_connect("/api/hardware/ws") as ws:
        assert _wait_until_registered() == "ok"
        ws.send_json({"event": "TELEMETRY_DATA", "position": {"X": 1.0, "Y": 2.0, "Z": 0.0}})
        ws.send_json({"event": "MOTOR_MOVED", "grbl_response": "ok"})
        # Koneksi masih hidup jika perintah motor lewat REST tetap berhasil diteruskan.
        # Jeda >0.5s lagi supaya tidak kena guard rate-limit dari panggilan sebelumnya.
        time.sleep(0.6)
        assert _move_grbl_response() == "ok"


# ============================================================
# KATEGORI J: DIDOKUMENTASIKAN TAPI SENGAJA TIDAK DIEKSEKUSI
# Kedua endpoint ini menghapus file ASLI (bukan hanya data buatan
# pengujian) di static/uploads dan static/datasets milik pengembang.
# Ditandai skip permanen — validasi dilakukan lewat code review dan
# eksekusi manual satu kali oleh pengembang, bukan lewat automated CI.
# ============================================================
@pytest.mark.skip(reason="DESTRUKTIF: menghapus seluruh file di static/uploads milik pengembang, bukan hanya data uji. Validasi manual saja.")
def test_feature_J01_purge_cache():
    response = client.delete("/api/dataset/storage/purge-cache")
    assert response.status_code == 200

@pytest.mark.skip(reason="DESTRUKTIF: menghapus SELURUH dataset & tabel DatasetFolder tanpa filter. Validasi manual saja, tidak pernah dijalankan otomatis.")
def test_feature_J02_purge_all():
    response = client.delete("/api/dataset/storage/purge-all")
    assert response.status_code == 200
