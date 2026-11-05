"""M01-M04: autentikasi dan otorisasi REST (A2)."""
import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.hardware.motor_driver import motor_driver
from app.main import app
from app.services.auth_service import create_access_token
from app.routers import hardware as hardware_router
from helpers import PASSWORD, auth, ensure_user, token_for

client = TestClient(app)

PROTECTED = [
    ("GET", "/api/auth/operators"),
    ("DELETE", "/api/auth/operators/1"),
    ("PUT", "/api/auth/profile/password"),
    ("GET", "/api/dataset/folders"),
    ("DELETE", "/api/dataset/storage/purge-all"),
    ("DELETE", "/api/dataset/storage/purge-cache"),
    ("GET", "/api/dataset/vps/sync-index"),
    ("GET", "/api/dataset/video/abc/x.mp4"),
    ("GET", "/api/logs"),
    ("POST", "/api/analysis/upload"),
    ("POST", "/api/documentation/generate"),
    ("POST", "/api/hardware/motor/move"),
    ("POST", "/api/hardware/scan/grid"),
    ("POST", "/api/hardware/stitch"),
    ("GET", "/api/hardware/config"),
    ("GET", "/api/hardware/telemetry/stats"),
    ("POST", "/api/hardware/bus/toggle"),
    ("POST", "/api/hardware/edge/restart"),
]

ADMIN_ONLY = [
    ("GET", "/api/auth/operators"),
    ("PUT", "/api/auth/operators/1/role"),
    ("DELETE", "/api/auth/operators/1"),
    ("PUT", "/api/auth/reset-password"),
    ("DELETE", "/api/dataset/storage/purge-all"),
    ("DELETE", "/api/dataset/storage/purge-cache"),
    ("DELETE", "/api/logs"),
    ("POST", "/api/hardware/cnc/settings"),
    ("POST", "/api/hardware/cnc/soft-limits"),
    ("POST", "/api/hardware/bus/toggle"),
    ("POST", "/api/hardware/edge/restart"),
    ("POST", "/api/hardware/room/admin_action"),
    ("POST", "/api/hardware/motor/set-position"),
    ("PUT", "/api/hardware/config/ai"),
    ("PUT", "/api/hardware/config/autogather"),
    ("POST", "/api/hardware/config/cnc/default"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
def test_M01_tanpa_token_401(method, path):
    assert client.request(method, path).status_code == 401


@pytest.mark.parametrize("path", ["/", "/api/version"])
def test_M01b_health_check_tetap_publik(path):
    assert client.get(path).status_code == 200


@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_M02_operator_ke_endpoint_admin_403(method, path, operator_token):
    assert client.request(method, path, headers=auth(operator_token), json={}).status_code == 403


def test_M03_token_kedaluwarsa_401():
    ensure_user("uji_expired", "OPERATOR")
    token = create_access_token({"sub": "uji_expired", "role": "OPERATOR"}, expires_delta=timedelta(seconds=-5))
    assert client.get("/api/logs", headers=auth(token)).status_code == 401


def test_M03b_token_palsu_dan_user_terhapus_401():
    assert client.get("/api/logs", headers=auth("bukan.token.asli")).status_code == 401
    ghost = create_access_token({"sub": "user_yang_tidak_pernah_ada", "role": "ADMIN"})
    assert client.get("/api/logs", headers=auth(ghost)).status_code == 401


@pytest.mark.parametrize("username", ["admin", "Admin", "ADMIN"])
def test_M04_registrasi_username_admin_tetap_operator(username):
    reg = client.post("/api/auth/register", json={"username": username, "password": PASSWORD})
    assert reg.status_code in (201, 400)
    login = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    if login.status_code == 200:
        assert login.json()["role"] == "OPERATOR"


def test_ganti_password_memakai_username_dari_token(operator_token):
    ensure_user("uji_korban", "OPERATOR")
    res = client.put("/api/auth/profile/password", headers=auth(operator_token), json={
        "username": "uji_korban", "old_password": PASSWORD, "new_password": "PasswordBaru456!"})
    assert res.status_code == 200
    # Password korban tetap, yang berubah justru akun pemilik token.
    assert client.post("/api/auth/login", json={"username": "uji_korban", "password": PASSWORD}).status_code == 200
    assert client.post("/api/auth/login", json={"username": "uji_operator", "password": "PasswordBaru456!"}).status_code == 200
    res = client.put("/api/auth/profile/password", headers=auth(operator_token), json={
        "old_password": "PasswordBaru456!", "new_password": PASSWORD})
    assert res.status_code == 200


def test_media_url_menerima_token_query(operator_token):
    assert client.get(f"/api/dataset/video/abc/x.mp4?token={operator_token}").status_code == 404
    assert client.get("/api/dataset/video/abc/x.mp4?token=salah").status_code == 401


def test_syncer_jetson_memakai_header_edge_token():
    assert client.get("/api/dataset/vps/sync-index", headers={"X-Edge-Token": "token-edge-pengujian"}).status_code == 200
    assert client.get("/api/dataset/vps/sync-index", headers={"X-Edge-Token": "salah"}).status_code == 401
    # Header edge tidak membuka endpoint lain.
    assert client.get("/api/dataset/folders", headers={"X-Edge-Token": "token-edge-pengujian"}).status_code == 401


def test_transisi_edge_token_required_false(monkeypatch):
    monkeypatch.setenv("EDGE_TOKEN_REQUIRED", "false")
    assert client.get("/api/dataset/vps/sync-index").status_code == 200
    assert client.get("/api/dataset/folders").status_code == 401


@pytest.mark.parametrize("query", ["", "?device_token=salah", "?device_token="])
def test_M05_ws_edge_tanpa_token_valid_ditutup_4003(query):
    with client.websocket_connect(f"/api/hardware/ws{query}") as ws:
        message = ws.receive()
    assert message["type"] == "websocket.close" and message["code"] == 4003
    assert motor_driver.jetson_websocket is None


def test_M05b_ws_edge_token_benar_terdaftar():
    with client.websocket_connect("/api/hardware/ws?device_token=token-edge-pengujian"):
        for _ in range(50):
            if motor_driver.jetson_websocket is not None:
                break
            time.sleep(0.05)
        assert motor_driver.jetson_websocket is not None


def test_M05c_transisi_jetson_lama_tanpa_token(monkeypatch):
    monkeypatch.setenv("EDGE_TOKEN_REQUIRED", "false")
    with client.websocket_connect("/api/hardware/ws"):
        for _ in range(50):
            if motor_driver.jetson_websocket is not None:
                break
            time.sleep(0.05)
        assert motor_driver.jetson_websocket is not None


PILOT_GUARDED = [
    ("/api/hardware/motor/move", {"axis": "X", "value": 1.0, "feed_rate": 250.0, "unit": "mm"}),
    ("/api/hardware/motor/home", None),
    ("/api/hardware/motor/unlock", None),
    ("/api/hardware/camera/settings", {"shutter_speed": 1000, "iso": 100}),
    ("/api/hardware/scan/grid", {"columns": 1, "rows": 1, "step_x": 1.0, "step_y": 1.0, "delay_ms": 0, "unit": "mm", "start_x": 0.0, "start_y": 0.0}),
    ("/api/hardware/scan/retake", {"coord_x": 0.0, "coord_y": 0.0, "filename": "x.jpg", "delay_ms": 0}),
]


@pytest.mark.parametrize("path,body", PILOT_GUARDED)
def test_M06_bukan_pilot_ditolak_409(path, body, operator_token):
    pilot_token = token_for("uji_pilot", "OPERATOR")
    with client.websocket_connect(f"/api/hardware/client/ws?token={pilot_token}"):
        res = client.post(path, json=body, headers=auth(operator_token))
    assert res.status_code == 409


def test_M06b_pilot_dan_admin_boleh_lewat_guard(admin_token):
    pilot_token = token_for("uji_pilot2", "OPERATOR")
    body = {"axis": "X", "value": 1.0, "feed_rate": 250.0, "unit": "mm"}
    with client.websocket_connect(f"/api/hardware/client/ws?token={pilot_token}"):
        assert client.post("/api/hardware/motor/move", json=body, headers=auth(pilot_token)).status_code == 200
        assert client.post("/api/hardware/motor/move", json=body, headers=auth(admin_token)).status_code == 200


def test_M06c_tanpa_pilot_operator_tetap_boleh(operator_token):
    assert hardware_router.room_manager.pilot is None
    body = {"axis": "X", "value": 1.0, "feed_rate": 250.0, "unit": "mm"}
    assert client.post("/api/hardware/motor/move", json=body, headers=auth(operator_token)).status_code == 200
