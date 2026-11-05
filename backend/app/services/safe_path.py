import os

from fastapi import HTTPException


def safe_name(name: str) -> str:
    """Validasi satu komponen path dari input pengguna.

    Sengaja TIDAK memakai whitelist karakter: dataset yang sudah ada memuat nama
    seperti 'result_brute_force(1).jpg', dan file berspasi dari perangkat pengguna
    harus tetap bisa diunggah, diunduh, dan dihapus. Yang ditolak adalah semua
    yang bisa keluar dari folder tujuan. Nama bermasalah DITOLAK (bukan dipotong
    dengan basename), supaya '../../x.txt' menjadi 400, bukan menulis 'x.txt'.
    """
    if (
        not isinstance(name, str)
        or not name
        or len(name) > 255
        or name in (".", "..")
        or "/" in name
        or "\\" in name
        or any(ord(ch) < 32 or ord(ch) == 127 for ch in name)
    ):
        raise HTTPException(status_code=400, detail="Nama file tidak valid")
    return name


def safe_join(root: str, *parts: str) -> str:
    """Gabungkan input pengguna ke `root` dan pastikan hasilnya tetap di dalamnya."""
    root_abs = os.path.realpath(root)
    path = os.path.realpath(os.path.join(root_abs, *[safe_name(p) for p in parts]))
    if os.path.commonpath([root_abs, path]) != root_abs:
        raise HTTPException(status_code=400, detail="Path di luar direktori yang diizinkan")
    return path
