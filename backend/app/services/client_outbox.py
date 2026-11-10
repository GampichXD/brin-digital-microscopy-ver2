"""Antrean kirim per browser: pesan kontrol dikirim semua, video hanya frame terbaru.

Tanpa ini, setiap frame video diteruskan ke setiap browser secara berurutan.
Kalau koneksi browser lebih lambat dari kamera, frame menumpuk di server dan
gambar yang dilihat makin tertinggal (terukur sampai 50+ detik) hingga koneksi
putus. Dengan outbox ini frame lama yang belum sempat terkirim dibuang: browser
lambat mendapat FPS lebih rendah tetapi gambar selalu terkini.
"""
import asyncio
from collections import deque
from typing import Awaitable, Callable, Optional

# Telemetri/progres scan jumlahnya kecil; batas ini hanya pengaman memori kalau
# browser macet total. Yang terbuang adalah pesan paling lama.
MAX_CONTROL_BACKLOG = 500


class ClientOutbox:
    def __init__(self, send: Callable[[str], Awaitable[None]], max_control: int = MAX_CONTROL_BACKLOG):
        self._send = send
        self._control: deque = deque(maxlen=max_control)
        self._video: Optional[str] = None
        self._wake = asyncio.Event()
        self.sent_frames = 0
        self.dropped_frames = 0

    def put(self, text: str, is_video: bool) -> None:
        if is_video:
            if self._video is not None:
                self.dropped_frames += 1
            self._video = text
        else:
            self._control.append(text)
        self._wake.set()

    def pending(self) -> int:
        return len(self._control) + (1 if self._video is not None else 0)

    async def run(self) -> None:
        """Kirim terus sampai dibatalkan atau send() gagal (koneksi tertutup)."""
        while True:
            await self._wake.wait()
            self._wake.clear()
            while self._control or self._video is not None:
                if self._control:
                    msg = self._control.popleft()
                else:
                    msg, self._video = self._video, None
                    self.sent_frames += 1
                await self._send(msg)
