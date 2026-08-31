"""
Pelacakan kehadiran user (online/offline) untuk panel Admin.

Sumber kebenaran "sedang login" = koneksi WebSocket klien (client/ws) yang
dikelola RoomManager. RoomManager memanggil mark_online/mark_offline; endpoint
/api/auth/login mencatat record_login. Semua in-memory (dashboard live) —
last_login juga dipersist ke SystemSetting oleh pemanggil bila perlu.
"""
import time

_online = {}       # username -> epoch terakhir terlihat
_last_login = {}    # username -> string waktu login terakhir (in-memory cache)

ONLINE_TTL = 120.0  # detik tanpa aktivitas -> dianggap offline


def mark_online(username: str) -> None:
    if username:
        _online[username] = time.time()


def touch(username: str) -> None:
    if username and username in _online:
        _online[username] = time.time()


def mark_offline(username: str) -> None:
    _online.pop(username, None)


def is_online(username: str) -> bool:
    t = _online.get(username)
    return bool(t and (time.time() - t) < ONLINE_TTL)


def online_usernames() -> list:
    return sorted(u for u in list(_online) if is_online(u))


def record_login(username: str, when: str) -> None:
    if username:
        _last_login[username] = when


def get_last_login(username: str) -> str:
    return _last_login.get(username, "")
