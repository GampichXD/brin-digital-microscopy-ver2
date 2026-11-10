#!/usr/bin/env python3
"""Tabel endpoint API (Markdown dan TSV untuk ditempel ke Word/Excel)."""
import os

P, L, A, E = "Publik", "Login", "Admin", "Login atau token Edge"
ROWS = [
    ("Health check backend (hanya dari dalam VPS; di situs live \"/\" menampilkan halaman web)", "GET", "/", P),
    ("Mengambil versi build backend", "GET", "/api/version", P),
    ("Login dengan username dan password, menghasilkan token JWT", "POST", "/api/auth/login", P),
    ("Mendaftarkan akun baru (selalu berperan Operator)", "POST", "/api/auth/register", P),
    ("Mengambil daftar operator beserta status online dan login terakhir", "GET", "/api/auth/operators", A),
    ("Mengubah peran operator", "PUT", "/api/auth/operators/{user_id}/role", A),
    ("Menghapus akun operator", "DELETE", "/api/auth/operators/{user_id}", A),
    ("Mereset password operator ke bawaan", "PUT", "/api/auth/reset-password", A),
    ("Mengganti password akun yang sedang login", "PUT", "/api/auth/profile/password", L),
    ("Membuat folder dataset", "POST", "/api/dataset/folders", L),
    ("Mengambil daftar folder dataset", "GET", "/api/dataset/folders", L),
    ("Mengubah nama, jenis objek, dan operator folder dataset", "PUT", "/api/dataset/folders/{folder_id}", L),
    ("Menghapus folder dataset (juga salinan di Jetson)", "DELETE", "/api/dataset/folders/{folder_id}", L),
    ("Memindahkan gambar hasil scan ke folder dataset", "PUT", "/api/dataset/folders/{folder_id}/add-images", L),
    ("Mengambil daftar gambar dan video dalam folder", "GET", "/api/dataset/folders/{folder_id}/images", L),
    ("Mengunggah file ke folder (dari browser atau sinkronisasi Jetson)", "POST", "/api/dataset/folders/{folder_id}/files", E),
    ("Mengunduh satu file dari folder", "GET", "/api/dataset/folders/{folder_id}/files/{filename}/download", E),
    ("Menghapus gambar tertentu dari folder (juga salinan di Jetson)", "DELETE", "/api/dataset/folders/{folder_id}/images", L),
    ("Mengunduh folder sebagai zip, opsional format YOLO (token boleh lewat ?token=)", "GET", "/api/dataset/folders/{folder_id}/download", L),
    ("Memutar video rekaman dengan dukungan Range (token boleh lewat ?token=)", "GET", "/api/dataset/video/{folder_id}/{filename}", L),
    ("Mengambil kapasitas dan pemakaian penyimpanan", "GET", "/api/dataset/storage-info", L),
    ("Mengambil indeks file VPS untuk sinkronisasi Jetson", "GET", "/api/dataset/vps/sync-index", E),
    ("Mengunduh cadangan seluruh dataset (zip)", "GET", "/api/dataset/storage/export", A),
    ("Menghapus file sementara (cache unggahan, hasil analisis, zip) tanpa menyentuh dataset", "DELETE", "/api/dataset/storage/purge-cache", A),
    ("Menghapus seluruh dataset dan metadatanya", "DELETE", "/api/dataset/storage/purge-all", A),
    ("Mengambil statistik CPU, RAM, dan suhu server serta Edge", "GET", "/api/hardware/telemetry/stats", P),
    ("Mengambil konfigurasi sistem yang tersimpan", "GET", "/api/hardware/config", L),
    ("Mengubah ambang keyakinan AI penghitung koloni", "PUT", "/api/hardware/config/ai", A),
    ("Menyimpan nilai bawaan Auto Gather", "PUT", "/api/hardware/config/autogather", A),
    ("Mengembalikan satu bagian konfigurasi ke nilai bawaan", "POST", "/api/hardware/config/{section}/default", A),
    ("Tindakan admin terhadap sesi pengguna (kick, jadikan pilot, dll.)", "POST", "/api/hardware/room/admin_action", A),
    ("Menggerakkan motor CNC (harus Pilot)", "POST", "/api/hardware/motor/move", L),
    ("Homing motor CNC (harus Pilot)", "POST", "/api/hardware/motor/home", L),
    ("Membuka kunci alarm GRBL (harus Pilot)", "POST", "/api/hardware/motor/unlock", L),
    ("Menetapkan koordinat posisi motor saat ini", "POST", "/api/hardware/motor/set-position", A),
    ("Me-restart layanan Edge di Jetson", "POST", "/api/hardware/edge/restart", A),
    ("Menerapkan pengaturan kamera (shutter, ISO)", "POST", "/api/hardware/camera/settings", L),
    ("Kalibrasi flat-field atau dark-frame kamera", "POST", "/api/hardware/camera/flatfield?mode=flat|dark", A),
    ("Menerapkan pengaturan CNC (feed rate, backlash, akselerasi)", "POST", "/api/hardware/cnc/settings", A),
    ("Mengatur batas gerak (soft limit) CNC", "POST", "/api/hardware/cnc/soft-limits", A),
    ("Memulai grid scan otomatis (harus Pilot)", "POST", "/api/hardware/scan/grid", L),
    ("Mengambil status dan progres grid scan", "GET", "/api/hardware/scan/status", L),
    ("Membatalkan grid scan", "POST", "/api/hardware/scan/cancel", L),
    ("Menghapus hasil satu sesi scan", "DELETE", "/api/hardware/scan/session/{session_id}", L),
    ("Mengambil ulang (retake) satu tile", "POST", "/api/hardware/scan/retake", L),
    ("Memulai stitching citra menjadi mosaik", "POST", "/api/hardware/stitch", L),
    ("Mengambil status stitching", "GET", "/api/hardware/stitch/status", L),
    ("Menempatkan tile hasil unggah ke grid stitching", "POST", "/api/hardware/stitch/place", L),
    ("Menempatkan tile dari dataset ke grid stitching", "POST", "/api/hardware/stitch/place-from-dataset", L),
    ("Menempatkan seluruh isi satu folder dataset ke grid stitching", "POST", "/api/hardware/stitch/place-folder", L),
    ("Mengaktifkan atau menonaktifkan hardware bus (fail-safe)", "POST", "/api/hardware/bus/toggle", A),
    ("Mengunggah citra untuk dianalisis", "POST", "/api/analysis/upload", L),
    ("Menjalankan alat analisis citra (colony-count, adaptive-thresh, contour, morphology, sobel, roi, calibrate, color-split)", "POST", "/api/analysis/{tool_name}", L),
    ("Mengambil status dan hasil analisis citra", "GET", "/api/analysis/status?output=", L),
    ("Membuat laporan otomatis (WORD, EXCEL, atau PPT)", "POST", "/api/documentation/generate?format=", L),
    ("Mengambil riwayat log aktivitas", "GET", "/api/logs", L),
    ("Mencatat log aktivitas", "POST", "/api/logs", L),
    ("Menghapus seluruh log aktivitas", "DELETE", "/api/logs", A),
    ("WebSocket Jetson: telemetri, perintah hardware, video, scan, stitching, analisis (token edge di ?device_token=)", "WS", "/api/hardware/ws", "Token Edge"),
    ("WebSocket browser: telemetri, video, status room, dan perintah Pilot (JWT di ?token=)", "WS", "/api/hardware/client/ws", L),
]

here = os.path.dirname(os.path.abspath(__file__))
md = ["# Daftar Endpoint API", "",
      "Sesuai kode backend per build `2026-11-10-latest-frame-outbox`. Kolom Akses:",
      "",
      "- **Publik**: tanpa login.",
      "- **Login**: wajib header `Authorization: Bearer <JWT>`; tanpa token dijawab 401.",
      "- **Admin**: login dengan peran Admin; operator biasa dijawab 403.",
      "- **Login atau token Edge**: JWT, atau header `X-Edge-Token` milik Jetson.",
      "",
      "| No | Deskripsi Fungsi | Metode | URL Endpoint | Akses |", "|---|---|---|---|---|"]
tsv = ["No\tDeskripsi Fungsi\tMetode\tURL Endpoint\tAkses"]
for i, (d, m, u, a) in enumerate(ROWS, 1):
    md.append(f"| {i} | {d} | {m} | `{u.replace('|', '&#124;')}` | {a} |")
    tsv.append(f"{i}\t{d}\t{m}\t{u}\t{a}")
md += ["", "## Perubahan dari daftar lama", "",
       "- Dihapus: `POST /api/dataset/vps-mock/sync` (sinkronisasi kini dari Jetson lewat `vps/sync-index` dan unggah file).",
       "- Baru: `storage/export`, `config/autogather`, `camera/flatfield`, `scan/session/{session_id}`, `stitch/place-folder`, `analysis/status`.",
       "- Hampir semua endpoint kini wajib login; fitur pengaturan, purge, dan manajemen operator khusus Admin."]
open(os.path.join(here, "DAFTAR_ENDPOINT.md"), "w").write("\n".join(md) + "\n")
open(os.path.join(here, "daftar_endpoint.tsv"), "w").write("\n".join(tsv) + "\n")
print(len(ROWS), "endpoint")
