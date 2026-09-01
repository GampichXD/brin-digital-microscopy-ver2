"""
=============================================================
FILE PENGUJIAN WHITE BOX - SISTEM MIKROSKOP DIGITAL
Menggunakan: Pytest + FastAPI TestClient
=============================================================
Cara menjalankan:
    .\\venv\\Scripts\\python.exe -m pytest test_api.py -v
"""
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import hash_password, verify_password, create_access_token

client = TestClient(app)

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
    import random
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
# KATEGORI C: FEATURE TEST - ENDPOINT HARDWARE
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
