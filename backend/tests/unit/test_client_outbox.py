"""Outbox per browser: kontrol dikirim semua, video hanya frame terbaru."""
import asyncio

from app.services.client_outbox import ClientOutbox


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_slow_client_gets_latest_frame_not_backlog():
    async def scenario():
        sent = []
        gate = asyncio.Event()

        async def slow_send(msg):
            await gate.wait()          # browser macet
            sent.append(msg)

        box = ClientOutbox(slow_send)
        task = asyncio.create_task(box.run())
        box.put("frame-0", True)
        await asyncio.sleep(0)          # frame-0 sedang dikirim (tertahan)
        for i in range(1, 50):
            box.put(f"frame-{i}", True)
        box.put("telemetry-1", False)
        gate.set()
        await asyncio.sleep(0.01)
        task.cancel()
        return sent, box

    sent, box = _run(scenario())
    assert sent == ["frame-0", "telemetry-1", "frame-49"]
    assert box.dropped_frames == 48
    assert box.sent_frames == 2


def test_control_messages_never_dropped_under_limit():
    async def scenario():
        sent = []

        async def send(msg):
            sent.append(msg)

        box = ClientOutbox(send)
        for i in range(100):
            box.put(f"t{i}", False)
        task = asyncio.create_task(box.run())
        await asyncio.sleep(0.01)
        task.cancel()
        return sent

    assert _run(scenario()) == [f"t{i}" for i in range(100)]


def test_control_backlog_is_bounded():
    box = ClientOutbox(lambda m: None, max_control=3)
    for i in range(10):
        box.put(f"t{i}", False)
    assert box.pending() == 3


def test_send_failure_ends_run():
    async def scenario():
        async def broken(msg):
            raise RuntimeError("closed")

        box = ClientOutbox(broken)
        box.put("x", False)
        try:
            await asyncio.wait_for(box.run(), 1)
        except RuntimeError:
            return True
        return False

    assert _run(scenario())
