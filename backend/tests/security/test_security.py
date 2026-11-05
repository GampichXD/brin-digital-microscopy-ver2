"""M01-M04: autentikasi dan otorisasi REST (A2)."""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.auth_service import create_access_token
from helpers import PASSWORD, auth, ensure_user

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
