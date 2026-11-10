#!/usr/bin/env python3
"""QoS WebSocket klien: Hz telemetri, jitter antar-telemetri, FPS, dan reconnect.

Contoh:
    BASE_URL=https://e-eye.cloud TEST_USER=... TEST_PASS=... python3 qa/ws_qos.py --duration 600
Keluaran: qa/results/ws_qos.csv dan ringkasan di terminal.
"""
import argparse
import asyncio
import csv
import json
import os
import statistics
import time

import requests
import websockets

HEARTBEAT_INTERVAL_S = 20  # tanpa HEARTBEAT, server memutus klien ini setelah 90 detik
# Pong bisa tertahan di belakang frame video saat Wi-Fi penuh. Batas bawaan 20 detik
# memutus klien uji padahal koneksinya masih jalan.
KEEPALIVE_TIMEOUT_S = 120


def login():
    base = os.environ["BASE_URL"].rstrip("/")
    res = requests.post(f"{base}/api/auth/login", timeout=15, json={
        "username": os.environ["TEST_USER"], "password": os.environ["TEST_PASS"]})
    res.raise_for_status()
    return base, res.json()["access_token"]


def percentile(values, q):
    if not values:
        return float("nan")
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


async def heartbeat(ws):
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL_S)
        await ws.send(json.dumps({"action": "HEARTBEAT"}))


async def collect(url, duration, rows):
    deadline = time.monotonic() + duration
    disconnects = 0
    while time.monotonic() < deadline:
        try:
            async with websockets.connect(url, max_size=None, ping_interval=20, ping_timeout=KEEPALIVE_TIMEOUT_S) as ws:
                await ws.send(json.dumps({"action": "START_STREAM"}))
                beat = asyncio.create_task(heartbeat(ws))
                try:
                    while time.monotonic() < deadline:
                        remaining = deadline - time.monotonic()
                        message = await asyncio.wait_for(ws.recv(), timeout=remaining)
                        event = json.loads(message).get("event")
                        if event in ("TELEMETRY_DATA", "STREAM_DATA"):
                            rows.append((time.time_ns(), event, len(message)))
                finally:
                    beat.cancel()
        except asyncio.TimeoutError:
            break
        except (websockets.exceptions.ConnectionClosed, OSError) as e:
            disconnects += 1
            print(f"Terputus: {e}. Menyambung ulang dalam 2 detik.")
            await asyncio.sleep(2)
    return disconnects


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--duration", type=float, default=600, help="lama rekam, detik")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "results", "ws_qos.csv"))
    args = parser.parse_args()

    base, token = login()
    url = base.replace("http", "ws", 1) + f"/api/hardware/client/ws?token={token}"
    rows = []
    disconnects = asyncio.run(collect(url, args.duration, rows))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["t_ns", "event", "bytes"])
        writer.writerows(rows)

    tele = [r[0] for r in rows if r[1] == "TELEMETRY_DATA"]
    gaps_ms = [(b - a) / 1e6 for a, b in zip(tele, tele[1:])]
    frames = sum(1 for r in rows if r[1] == "STREAM_DATA")
    print(f"Telemetri: {len(tele) / args.duration:.2f} Hz (target 5)")
    if gaps_ms:
        print(f"Jitter: p50={percentile(gaps_ms, .5):.1f} ms, p95={percentile(gaps_ms, .95):.1f} ms, "
              f"stdev={statistics.pstdev(gaps_ms):.1f} ms")
    print(f"FPS: {frames / args.duration:.2f}")
    print(f"Terputus: {disconnects} kali")
    print(f"Data: {args.out}")


if __name__ == "__main__":
    main()
