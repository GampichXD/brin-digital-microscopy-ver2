"""N01-N04: rumus persamaan (1)-(6) laporan."""
import math
import time
import uuid
from collections import namedtuple

import pytest
from fastapi.testclient import TestClient
from hypothesis import given, strategies as st

from app.main import app
from app.routers import hardware
from app.services.scan_planner import (
    CAPTURE_OVERHEAD_S,
    MIN_MOVE_DELAY_S,
    ROW_CHANGE_SETTLE_S,
    compute_delay,
    estimate_scan_seconds,
    plan_serpentine,
)
from helpers import auth, token_for


def test_N01_serpentine_3x3():
    points = [(t["x"], t["y"]) for t in plan_serpentine(3, 3, 0.0, 0.0, 1.0, 2.0)]
    assert points == [(0, 0), (1, 0), (2, 0), (2, 2), (1, 2), (0, 2), (0, 4), (1, 4), (2, 4)]


def test_N01b_label_grid_dibalik_dan_titik_awal():
    tiles = plan_serpentine(3, 3, 5.0, 7.0, 1.0, 1.0)
    assert (tiles[0]["x"], tiles[0]["y"]) == (5.0, 7.0)
    assert (tiles[0]["grid_row"], tiles[0]["grid_col"]) == (2, 2)
    assert (tiles[-1]["grid_row"], tiles[-1]["grid_col"]) == (0, 0)


@given(st.integers(1, 12), st.integers(1, 12))
def test_N01c_serpentine_properti(rows, cols):
    tiles = plan_serpentine(rows, cols, 0.0, 0.0, 1.0, 1.0)
    assert len(tiles) == rows * cols
    # Setiap posisi grid muncul tepat sekali, dan langkah berurutan selalu sejauh 1 sel.
    assert len({(t["grid_row"], t["grid_col"]) for t in tiles}) == rows * cols
    for a, b in zip(tiles, tiles[1:]):
        assert abs(a["x"] - b["x"]) + abs(a["y"] - b["y"]) == 1
    assert sum(t["row_change"] for t in tiles) == rows - 1


def test_N02_delay_jarak_pendek_memakai_batas_minimum():
    assert compute_delay(1.0, 250 / 60, 200) == pytest.approx(0.5 + 0.2)


def test_N02b_delay_jarak_jauh_memakai_waktu_tempuh():
    assert compute_delay(10.0, 250 / 60, 200) == pytest.approx(10.0 / (250 / 60) + 0.2)


def test_N02c_tanpa_gerak_dan_jeda_ganti_baris():
    assert compute_delay(0.0, 250 / 60, 0) == MIN_MOVE_DELAY_S
    assert compute_delay(0.0, 250 / 60, 0, row_change=True) == MIN_MOVE_DELAY_S + ROW_CHANGE_SETTLE_S
    assert compute_delay(0.0, 250 / 60, 0, row_change=True, row_settle_s=0.0) == MIN_MOVE_DELAY_S


@given(st.floats(0, 1000), st.floats(0.01, 100), st.integers(0, 5000), st.booleans())
def test_N02d_delay_selalu_di_atas_komponennya(distance, feed, delay_ms, row_change):
    t = compute_delay(distance, feed, delay_ms, row_change)
    assert t >= MIN_MOVE_DELAY_S + delay_ms / 1000.0
    assert t >= distance / feed


def test_N02e_estimasi_scan_memakai_rumus_yang_sama():
    # 2x2, langkah 1 mm: titik awal + 3 langkah, 1 ganti baris.
    assert estimate_scan_seconds(2, 2, 1.0, 1.0, 250.0, 100, capture_s=0.0) == pytest.approx(
        4 * 0.6 + ROW_CHANGE_SETTLE_S)


def test_N02b_eta_includes_capture_per_tile():
    """Persamaan (5): tiap tile menambah waktu capture, terukur 0,43 s pada uji t05."""
    without = estimate_scan_seconds(10, 10, 0.5, 0.5, 250.0, 500, capture_s=0.0)
    assert estimate_scan_seconds(10, 10, 0.5, 0.5, 250.0, 500) == pytest.approx(without + 100 * CAPTURE_OVERHEAD_S)
    assert CAPTURE_OVERHEAD_S == pytest.approx(0.43)


def test_N03_rate_limit_rest_per_user():
    client = TestClient(app)
    headers = auth(token_for(f"n03_{uuid.uuid4().hex[:6]}", "ADMIN"))
    other = auth(token_for(f"n03_{uuid.uuid4().hex[:6]}", "ADMIN"))
    body = {"axis": "X", "value": 0.1, "feed_rate": 250.0, "unit": "mm"}
    assert client.post("/api/hardware/motor/move", json=body, headers=headers).status_code == 200
    assert client.post("/api/hardware/motor/move", json=body, headers=headers).status_code == 429
    assert client.post("/api/hardware/motor/move", json=body, headers=other).status_code == 200
    time.sleep(0.55)
    assert client.post("/api/hardware/motor/move", json=body, headers=headers).status_code == 200


def test_N03b_sumbu_tidak_valid_ditolak():
    client = TestClient(app)
    headers = auth(token_for(f"n03_{uuid.uuid4().hex[:6]}", "ADMIN"))
    body = {"axis": "X1\n$RST=*", "value": 0.1, "feed_rate": 250.0, "unit": "mm"}
    assert client.post("/api/hardware/motor/move", json=body, headers=headers).status_code == 400


Net = namedtuple("Net", "bytes_sent bytes_recv")


def test_N04_bandwidth_persamaan_5(monkeypatch):
    client = TestClient(app)
    headers = auth(token_for("n04", "OPERATOR"))
    monkeypatch.setattr(hardware, "last_net_io", Net(0, 0))
    monkeypatch.setattr(hardware, "last_net_time", 100.0)
    monkeypatch.setattr(hardware.time, "time", lambda: 102.0)
    # 1 MB terkirim + 1 MB diterima dalam 2 detik = 8 Mbps.
    monkeypatch.setattr(hardware.psutil, "net_io_counters", lambda: Net(1_000_000, 1_000_000))
    data = client.get("/api/hardware/telemetry/stats", headers=headers).json()
    assert data["serverBandwidth"] == pytest.approx(8.0)


def test_A9_feed_rate_dan_jeda_baris_dari_database():
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        hardware.save_setting(db, "feedRate", "600")
        assert hardware._setting_float(db, "feedRate", 250.0) == 600.0
        hardware.save_setting(db, "feedRate", "bukan-angka")
        assert hardware._setting_float(db, "feedRate", 250.0) == 250.0
        hardware.save_setting(db, "feedRate", "0")
        assert hardware._setting_float(db, "feedRate", 250.0) == 250.0
        hardware.save_setting(db, "rowChangeSettleS", "0")
        assert hardware._setting_float(db, "rowChangeSettleS", 1.0, minimum=0.0) == 0.0
    finally:
        db.query(hardware.models.SystemSetting).filter(
            hardware.models.SystemSetting.key.in_(["feedRate", "rowChangeSettleS"])).delete(synchronize_session=False)
        db.commit()
        db.close()
