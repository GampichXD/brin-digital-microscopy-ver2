"""R01-R13: aturan kursi Pilot / Spectator / Antrean (RoomManager), tanpa jaringan."""
import asyncio
import json

import pytest

from app.routers.hardware import GHOST_TIMEOUT_S, MAX_SPECTATORS, PILOT_IDLE_S, RoomManager


class FakeWS:
    client = None

    def __init__(self, name):
        self.name = name
        self.sent = []
        self.closed = None

    async def send_text(self, text):
        self.sent.append(json.loads(text))

    async def close(self, code=1000):
        self.closed = code

    def roles(self):
        return [m for m in self.sent if m.get("event") == "ROLE_ASSIGNED"]


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


async def _room(n):
    room = RoomManager()
    sockets = [FakeWS(f"u{i}") for i in range(n)]
    for ws in sockets:
        await room.connect(ws, ws.name, "OPERATOR")
    return room, sockets


def _age(user, seen=0, active=0):
    user["last_seen"] -= seen
    user["last_active"] -= active


def _now(room):
    p = room.pilot or (room.spectators + room.queue)[0]
    return max(p["last_seen"], p["last_active"])


def test_R01_penempatan_awal():
    async def go():
        room, s = await _room(5)
        assert room.get_role(s[0]) == "PILOT"
        assert [room.get_role(w) for w in s[1:3]] == ["SPECTATOR"] * MAX_SPECTATORS
        assert [room.get_role(w) for w in s[3:]] == ["QUEUED"] * 2
    run(go())


def test_R02_kaskade_sampai_habis():
    async def go():
        room, s = await _room(4)
        for i in range(3):
            await room.disconnect(s[i])
            assert room.get_role(s[i + 1]) == "PILOT"
        await room.disconnect(s[3])
        assert room.pilot is None and not room.spectators and not room.queue
    run(go())


def test_R03_spectator_diisi_dari_antrean():
    async def go():
        room, s = await _room(4)
        await room.disconnect(s[1])
        assert room.get_role(s[3]) == "SPECTATOR"
        assert s[3].roles()[-1]["role"] == "SPECTATOR"
    run(go())


def test_R04_promosi_mereset_timer():
    async def go():
        room, s = await _room(3)
        _age(room.spectators[0], active=PILOT_IDLE_S - 30)
        await room.disconnect(s[0])
        assert room.get_role(s[1]) == "PILOT"
        await room.idle_sweep(_now(room) + 60)
        assert room.get_role(s[1]) == "PILOT"
    run(go())


def test_R05_spectator_menonton_30_menit_tetap_aman():
    async def go():
        room, s = await _room(2)
        for _ in range(90):
            for u in [room.pilot, *room.spectators]:
                u["last_active"] -= 20
            room.update_activity(s[0], active=True)
            room.update_activity(s[1], active=False)
            await room.idle_sweep(room.spectators[0]["last_seen"])
        assert room.get_role(s[1]) == "SPECTATOR" and s[1].closed is None
    run(go())


def test_R06_antrean_tidak_dikeluarkan_karena_diam():
    async def go():
        room, s = await _room(4)
        now = _now(room)
        room.update_activity(s[3], active=False)
        _age(room.queue[0], active=PILOT_IDLE_S * 3)
        await room.idle_sweep(now)
        assert room.get_role(s[3]) == "QUEUED" and s[3].closed is None
    run(go())


def test_R07_pilot_diam_diturunkan_kalau_ada_yang_menunggu():
    async def go():
        room, s = await _room(2)
        now = _now(room)
        _age(room.pilot, active=PILOT_IDLE_S + 1)
        await room.idle_sweep(now)
        assert room.get_role(s[1]) == "PILOT"
        assert room.get_role(s[0]) == "SPECTATOR"
        assert s[0].roles()[-1] == {"event": "ROLE_ASSIGNED", "role": "SPECTATOR", "reason": "IDLE"}
        assert s[0].closed is None
    run(go())


def test_R08_pilot_diam_tetap_pilot_kalau_sendirian():
    async def go():
        room, s = await _room(1)
        now = _now(room)
        _age(room.pilot, active=PILOT_IDLE_S * 2)
        await room.idle_sweep(now)
        assert room.get_role(s[0]) == "PILOT" and s[0].closed is None
    run(go())


def test_R09_pilot_diam_masuk_antrean_kalau_spectator_penuh():
    async def go():
        room, s = await _room(4)
        now = _now(room)
        _age(room.pilot, active=PILOT_IDLE_S + 1)
        await room.idle_sweep(now)
        assert room.get_role(s[1]) == "PILOT"
        assert room.get_role(s[3]) == "SPECTATOR"
        assert room.get_role(s[0]) == "QUEUED"
        assert s[0].roles()[-1]["reason"] == "IDLE"
    run(go())


def test_R10_koneksi_hantu_dibersihkan():
    async def go():
        room, s = await _room(2)
        now = _now(room)
        _age(room.spectators[0], seen=GHOST_TIMEOUT_S + 1)
        await room.idle_sweep(now)
        assert room.get_role(s[1]) == "DISCONNECTED"
        assert s[1].closed == 1000
        assert s[1].roles()[-1]["role"] == "IDLE_TIMEOUT"
    run(go())


def test_R11_heartbeat_bukan_interaksi():
    async def go():
        room, s = await _room(1)
        room.pilot["last_seen"] = room.pilot["last_active"] = 100.0
        room.update_activity(s[0], active=False)
        assert room.pilot["last_seen"] > 100.0 and room.pilot["last_active"] == 100.0
        room.update_activity(s[0], active=True)
        assert room.pilot["last_active"] > 100.0
    run(go())


def test_R12_maksimal_3_perangkat_per_akun():
    async def go():
        room = RoomManager()
        sockets = [FakeWS("sama") for _ in range(4)]
        results = [await room.connect(ws, "sama", "OPERATOR") for ws in sockets]
        assert results[3] is None and sockets[3].closed == 1008
        assert sockets[3].roles()[-1]["role"] == "MAX_DEVICES_REACHED"
    run(go())


def test_R13_make_queue_admin_tidak_langsung_dipromosikan_lagi():
    async def go():
        room, s = await _room(2)
        cid = room.spectators[0]["cid"]
        assert await room.admin_action(cid, "MAKE_QUEUE") is True
        assert room.get_role(s[1]) == "QUEUED"
        assert not room.spectators
        pilot_cid = room.pilot["cid"]
        assert await room.admin_action(pilot_cid, "MAKE_QUEUE") is True
        assert room.pilot is None or room.pilot["ws"] is not s[0]
        assert room.get_role(s[0]) == "QUEUED"
    run(go())
