"""M07-M09 (A3b): perintah browser lewat WebSocket wajib lolos guard sebelum ke Jetson."""
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from hypothesis import given, strategies as st

from app.main import app
from app.routers import hardware
from app.routers.hardware import _GCODE_RE, check_motor_rate_limit, validate_client_command
from helpers import token_for


class FakePubSub:
    async def subscribe(self, *a): pass
    async def unsubscribe(self, *a): pass
    async def close(self): pass
    async def listen(self):
        import asyncio
        await asyncio.Event().wait()
        yield


class FakeRedis:
    def __init__(self):
        self.published = []
    async def publish(self, channel, message):
        self.published.append((channel, json.loads(message)))
    def pubsub(self): return FakePubSub()
    async def close(self): pass


@pytest.fixture
def redis(monkeypatch):
    fake = FakeRedis()
    async def get_client(url):
        return fake
    monkeypatch.setattr(hardware, "get_redis_client", get_client)
    monkeypatch.setattr(hardware, "hardware_bus_enabled", True)
    hardware.last_command_time.clear()
    return fake


def _url(user, role="OPERATOR"):
    return f"/api/hardware/client/ws?token={token_for(user, role)}"


def _commands(redis):
    return [m for ch, m in redis.published if ch == "hardware_commands"]


def _until(ws, event):
    while True:
        msg = ws.receive_json()
        if msg.get("event") == event:
            return msg


MOVE = {"action": "MOVE_MOTOR", "gcode": "G1 X1.000 F250"}


def test_M07_spectator_tidak_bisa_menggerakkan_motor(redis):
    client = TestClient(app)
    with client.websocket_connect(_url("ws_pilot")) as pilot:
        with client.websocket_connect(_url("ws_spec")) as spec:
            spec.send_json(MOVE)
            assert _until(spec, "COMMAND_REJECTED")["reason"] == "NOT_PILOT"
            assert _commands(redis) == []
            pilot.send_json(MOVE)
            pilot.send_json({"action": "HEARTBEAT"})
            spec.send_json({"action": "RESTART_EDGE"})
            assert _until(spec, "COMMAND_REJECTED")["reason"] == "NOT_ALLOWED"
    assert _commands(redis) == [MOVE]


def test_M08_bus_mati_menolak_move_motor(redis, monkeypatch):
    monkeypatch.setattr(hardware, "hardware_bus_enabled", False)
    client = TestClient(app)
    with client.websocket_connect(_url("ws_bus")) as ws:
        ws.send_json(MOVE)
        assert _until(ws, "COMMAND_REJECTED")["reason"] == "BUS_DISABLED"
    assert _commands(redis) == []


def test_M09_dua_perintah_kurang_dari_setengah_detik(redis):
    client = TestClient(app)
    with client.websocket_connect(_url("ws_rate")) as ws:
        ws.send_json(MOVE)
        ws.send_json(MOVE)
        assert _until(ws, "COMMAND_REJECTED")["reason"] == "RATE_LIMIT"
        time.sleep(0.55)
        ws.send_json(MOVE)
        ws.send_json({"action": "G_TIDAK_ADA"})
        assert _until(ws, "COMMAND_REJECTED")["reason"] == "NOT_ALLOWED"
    assert len(_commands(redis)) == 2


def test_pesan_rusak_tidak_diteruskan_dan_koneksi_tetap_hidup(redis):
    client = TestClient(app)
    with client.websocket_connect(_url("ws_rusak")) as ws:
        ws.send_text("bukan json")
        ws.send_text("[1, 2]")
        ws.send_json({"action": "HEARTBEAT"})
        ws.send_json({"action": "RESTART_EDGE"})
        assert _until(ws, "COMMAND_REJECTED")["reason"] == "NOT_ALLOWED"
    assert _commands(redis) == []


def _check(data, seat="PILOT", role="OPERATOR", user=None, now=1000.0):
    hardware.hardware_bus_enabled = True
    return validate_client_command(data, seat, role, user or uuid.uuid4().hex, now)


@pytest.mark.parametrize("gcode", [
    "G1 X1.000 F250", "G1 Y-0.500 F250.5", "G1 Z2.000 F200", "G0 X1.000 Y2.000 Z3.000",
    "G1 X0.05 F250", "G90", "G91", "$H", "$X",
])
def test_gcode_dari_frontend_lolos(gcode):
    assert _check({"action": "MOVE_MOTOR", "gcode": gcode}) is None


@pytest.mark.parametrize("gcode", [
    "$RST=*", "$$", "$120=1000", "G1 X1\n$RST=*", "G1 X1\n", "G91 G1 X0.05 F250", "G28", "M3 S1000",
    "G1", "G1 X", "G1 A1", "", "G1 X1;$H", "G1  X1 $X",
])
def test_gcode_berbahaya_ditolak(gcode):
    assert _check({"action": "MOVE_MOTOR", "gcode": gcode}) == "INVALID_GCODE"


@given(st.text(max_size=40))
def test_gcode_properti_tidak_ada_baris_baru_yang_lolos(text):
    if _GCODE_RE.fullmatch(text):
        assert "\n" not in text and "\r" not in text and "=" not in text


def test_set_position_lewat_ws_hanya_admin():
    assert _check({"action": "SET_POSITION", "x": 0, "y": 0, "z": 0}) == "NOT_ALLOWED"
    assert _check({"action": "SET_POSITION", "x": 0, "y": 0, "z": 0}, seat="SPECTATOR", role="ADMIN") is None


def test_admin_boleh_walau_bukan_pilot_dan_spectator_boleh_kamera():
    assert _check(MOVE, seat="SPECTATOR", role="ADMIN") is None
    assert _check({"action": "START_STREAM"}, seat="SPECTATOR") is None


def test_mode_g90_tidak_kena_rate_limit():
    user = uuid.uuid4().hex
    assert _check(MOVE, user=user) is None
    assert _check({"action": "MOVE_MOTOR", "gcode": "G90"}, user=user, now=1000.1) is None
    assert _check({"action": "UNLOCK"}, user=user, now=1000.1) is None
    assert _check(MOVE, user=user, now=1000.1) == "RATE_LIMIT"


@pytest.mark.parametrize("fps,reason", [(30, None), (1, None), (0, "INVALID_PARAM"), (-1, "INVALID_PARAM"), ("30", "INVALID_PARAM"), (None, "INVALID_PARAM")])
def test_set_fps_divalidasi(fps, reason):
    assert _check({"action": "SET_FPS", "fps": fps}) == reason


def test_rate_limit_batas_setengah_detik():
    user = uuid.uuid4().hex
    assert check_motor_rate_limit(user, 100.0) is True
    assert check_motor_rate_limit(user, 100.49) is False
    assert check_motor_rate_limit(user, 100.5) is True
