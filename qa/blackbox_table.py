#!/usr/bin/env python3
"""Susun tabel pengujian black box dari hasil Playwright dan Newman yang sebenarnya.

    python3 qa/blackbox_table.py

Membaca frontend/e2e-results.json (Playwright) dan qa/results/newman.json (Newman).
Kolom "Hasil Pengujian" dan "Kesimpulan" diisi dari status tes, bukan diketik manual.
Keluaran: qa/results/BLACKBOX.md dan qa/results/blackbox.tsv (bisa ditempel ke Word/Excel).
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PW = os.path.join(ROOT, "frontend", "e2e-results.json")
NM = os.path.join(ROOT, "qa", "results", "newman.json")
OUT_MD = os.path.join(ROOT, "qa", "results", "BLACKBOX.md")
OUT_TSV = os.path.join(ROOT, "qa", "results", "blackbox.tsv")

# (judul tes Playwright, fitur, skenario, langkah/input, hasil yang diharapkan, hasil bila lolos)
UI = [
    ("login gagal dengan kredensial salah menampilkan pesan error", "Autentikasi",
     "Login dengan akun yang tidak terdaftar",
     "Username: operator_tidak_ada_<waktu>; Password: password_salah_123; klik MASUK KE INSTRUMEN",
     "Muncul pesan \"ID Operator atau Password salah\" dan tetap di halaman login",
     "Pesan error tampil, pengguna tidak masuk"),
    ("submit form kosong menampilkan toast peringatan", "Autentikasi",
     "Login dengan form kosong",
     "Username dan password dikosongkan; klik MASUK KE INSTRUMEN",
     "Muncul peringatan \"Username dan password tidak boleh kosong!\"",
     "Peringatan tampil"),
    ("registrasi operator baru lalu login berhasil masuk ke dashboard", "Autentikasi",
     "Registrasi akun baru lalu login",
     "Klik REGISTER; isi username unik, password TestPassword123! dua kali; klik DAFTARKAN OPERATOR; login dengan akun tersebut",
     "Registrasi berhasil, kembali ke form login, lalu masuk ke dashboard (panel Kendali Motor tampil)",
     "Dashboard tampil setelah login"),
    ("konfirmasi password tidak cocok menampilkan peringatan", "Registrasi",
     "Registrasi dengan konfirmasi password berbeda",
     "Password: PasswordA123!; Ulangi password: PasswordB456!; klik DAFTARKAN OPERATOR",
     "Muncul peringatan \"Konfirmasi password tidak cocok!\" dan akun tidak dibuat",
     "Peringatan tampil, akun tidak dibuat"),
    ("username yang sudah terdaftar menampilkan pesan error", "Registrasi",
     "Registrasi dengan username yang sudah dipakai",
     "Daftarkan username X, lalu daftarkan username X lagi",
     "Muncul pesan bahwa username sudah terdaftar",
     "Pesan \"sudah terdaftar\" tampil"),
    ("logout mengembalikan pengguna ke halaman autentikasi", "Autentikasi",
     "Logout",
     "Login, lalu klik tombol Keluar dari Instrumen",
     "Kembali ke halaman login",
     "Halaman login tampil"),
    ("operator dapat mengubah password akun miliknya sendiri", "Profil akun",
     "Operator mengganti password sendiri",
     "Buka Profil Akun; password lama: PasswordLama123!; password baru: PasswordBaru456! dua kali; klik Simpan Perubahan",
     "Muncul \"Password berhasil diubah secara permanen.\"",
     "Password berhasil diubah"),
    ("operator biasa tidak melihat tab Admin Control", "Hak akses (RBAC)",
     "Operator tidak melihat menu Admin",
     "Login sebagai operator biasa",
     "Tab Database tampil, tab Admin Control tidak ada",
     "Tab Admin Control tidak tampil"),
    ("operator melihat seluruh 5 tab non-admin secara lengkap", "Hak akses (RBAC)",
     "Operator melihat semua tab yang menjadi haknya",
     "Login sebagai operator biasa",
     "Tab Live Stream, Database, Image Gathering, Image Analysis, dan Documentation tampil",
     "Kelima tab tampil"),
    ("operator tidak bisa menerapkan setelan CNC", "Hak akses (RBAC)",
     "Operator tidak bisa mengubah setelan CNC dan soft limit",
     "Login sebagai operator; buka panel Live Stream",
     "Tombol setelan CNC dan soft limit nonaktif dengan keterangan \"hanya untuk Admin\"",
     "Kedua tombol nonaktif"),
    ("Admin melihat daftar operator dan dapat mereset password operator lain", "Kelola operator (Admin)",
     "Admin mereset password operator lain",
     "Login sebagai Admin; buka Admin Control; pada baris operator target klik Reset Password lalu konfirmasi",
     "Daftar operator tampil dan password operator berhasil direset",
     "Reset password berhasil"),
    ("panel Kendali Motor menampilkan kontrol D-pad dan tombol unlock", "Kendali motor",
     "Panel kendali motor tersedia",
     "Login; lihat panel Kendali Motor",
     "Kontrol MEJA (X/Y), FOKUS (Z), dan tombol Unlock GRBL tampil",
     "Seluruh kontrol tampil"),
    ("mengirim koordinat tujuan lewat mode manual tidak menimbulkan error", "Kendali motor",
     "Go-To Coordinate pada mode manual",
     "Buka Image Gathering; pilih MANUAL GATHER; isi koordinat; klik GO",
     "Perintah terkirim tanpa error dan panel Go-To Coordinate tetap tampil",
     "Perintah terkirim tanpa error"),
    ("menerapkan pengaturan CNC (feed rate/backlash/dll) dari panel Live Stream", "Pengaturan CNC (Admin)",
     "Admin menerapkan setelan CNC",
     "Login sebagai Admin; buka Live Stream; ubah Motor Speed / Feed; klik TERAPKAN",
     "Setelan terkirim tanpa error",
     "Setelan terkirim"),
    ("menerapkan pengaturan kamera (shutter/ISO) dari panel Live Stream", "Pengaturan kamera",
     "Menerapkan setelan kamera",
     "Buka Live Stream; ubah Sensor Gain (ISO); klik TERAPKAN",
     "Setelan terkirim tanpa error",
     "Setelan terkirim"),
    ("toggle Power Bus dari UI benar-benar mengubah state di backend", "Hardware bus (Admin)",
     "Admin mematikan hardware bus",
     "Login sebagai Admin; buka Admin Control; klik toggle INSTRUMEN POWER BUS",
     "Status hardware bus di server berubah menjadi mati (dicek lewat /api/hardware/telemetry/stats)",
     "Status bus di server berubah"),
    ("restart layanan Edge ditolak dengan jelas saat Jetson offline", "Pemeliharaan Edge (Admin)",
     "Restart layanan Edge saat Jetson offline",
     "Login sebagai Admin; Admin Control; klik Restart Sekarang lalu konfirmasi Restart",
     "Muncul pesan bahwa Edge offline atau restart gagal, tanpa crash",
     "Pesan penolakan tampil"),
    ("panel Vision AI Inference dan CNC & GRBL Maintenance tampil untuk Admin", "Konfigurasi Edge (Admin)",
     "Panel konfigurasi AI, CNC, dan kamera tersedia untuk Admin",
     "Login sebagai Admin; buka Admin Control",
     "Panel Vision AI Inference, CNC & GRBL Maintenance, dan Camera Optics (IMX477) tampil",
     "Ketiga panel tampil"),
    ("panel Storage Management tampil dengan info kapasitas", "Penyimpanan (Admin)",
     "Info kapasitas penyimpanan",
     "Login sebagai Admin; buka Admin Control",
     "Panel Storage Management tampil dengan informasi kapasitas",
     "Panel dan kapasitas tampil"),
    ("status Edge Device dan statistik RAM/ROM tampil di header", "Pantau telemetri",
     "Status Edge dan statistik server tampil",
     "Login; lihat header",
     "Status Edge (OFFLINE saat Jetson tidak terhubung), RAM, dan ROM tampil",
     "Status dan statistik tampil"),
    ("membuat folder dataset baru lewat UI dan muncul di daftar", "Kelola dataset",
     "Membuat folder dataset",
     "Buka Database; klik BUAT BARU; Nama Folder: <unik>; Jenis Objek: Bakteri Uji E2E; Nama Operator; klik SIMPAN",
     "Folder baru muncul di daftar",
     "Folder muncul di daftar"),
    ("AUTO GATHER menjalankan grid scan sampai selesai dan melaporkan gagal kalau tidak ada gambar (Edge offline)", "Grid scan otomatis",
     "Grid scan 2×2 saat Jetson offline",
     "Buka Image Gathering; Kolom: 2; Baris: 2; klik CAPTURE 4 GAMBAR",
     "Scan berjalan sampai akhir, lalu muncul pesan bahwa tidak ada gambar yang berhasil diambil (tidak mengaku berhasil)",
     "Pesan kegagalan tampil, tidak ada klaim berhasil"),
    ("operator dapat memantau progres dan membatalkan grid scan yang sedang berjalan", "Grid scan otomatis",
     "Memantau progres lalu membatalkan scan",
     "Kolom: 3; Baris: 3; klik CAPTURE 9 GAMBAR; saat progres Tile n/9 tampil, klik BATAL",
     "Progres per tile tampil real-time, lalu muncul \"Pemindaian dibatalkan\"",
     "Progres tampil, scan dibatalkan"),
    ("stitching terkunci kalau grid scan tidak menghasilkan citra (Edge offline)", "Tile stitching",
     "Stitching tanpa citra",
     "Jalankan grid scan 2×2 saat Jetson offline; buka hasil tangkapan",
     "Tombol TILE STITCHING nonaktif",
     "Tombol stitching nonaktif"),
    ("unggah citra lalu terapkan tool Adaptive Thresholding (fallback OpenCV server saat Edge offline)", "Analisis citra",
     "Menerapkan Adaptive Thresholding",
     "Buka Image Analysis; unggah e2e_specimen.jpg; klik Adaptive Thresholding",
     "Citra diproses dan status \"ADAPTIVE THRESHOLDING\" tampil",
     "Citra diproses"),
    ("memilih folder dan membuat laporan Word tidak menampilkan error", "Laporan otomatis",
     "Membuat laporan Word",
     "Buka Documentation; pilih folder dataset; klik Generate Microsoft Word",
     "Laporan tersusun tanpa error",
     "Laporan tersusun"),
    ("tabel log aktivitas tampil dan dapat dicari", "Log aktivitas",
     "Mencari di log aktivitas",
     "Buka Documentation; ketik operator_yang_tidak_mungkin_ada_xyz di kolom cari",
     "Tabel log tampil dan pencarian berjalan tanpa error",
     "Tabel dan pencarian berjalan"),
]

# (awalan nama folder Newman, filter nama request, fitur, skenario, langkah/input, hasil yang diharapkan, hasil bila lolos)
API = [
    ("03", lambda n: n.endswith("tanpa token"), "Keamanan API",
     "Akses semua endpoint terlindungi tanpa token",
     "Kirim request ke setiap endpoint selain 5 endpoint publik, tanpa header Authorization",
     "Semua dijawab 401 Unauthorized", "Semua dijawab 401"),
    ("03", lambda n: "JWT palsu" in n, "Keamanan API",
     "Akses dengan token JWT palsu",
     "Header Authorization: Bearer <JWT dengan tanda tangan palsu> ke daftar folder dan purge-all",
     "Dijawab 401, data tidak terhapus", "Dijawab 401"),
    ("03", lambda n: "token edge salah" in n, "Keamanan API",
     "Akses sinkronisasi dengan token Edge salah",
     "Header X-Edge-Token: token-edge-salah ke /api/dataset/vps/sync-index",
     "Dijawab 401", "Dijawab 401"),
    ("04", lambda n: True, "Hak akses (RBAC)",
     "Operator mengakses fitur khusus Admin lewat API",
     "Token operator ke 18 endpoint Admin (kelola operator, purge, konfigurasi, CNC, restart Edge, hardware bus, hapus log)",
     "Semua dijawab 403 Forbidden", "Semua dijawab 403"),
    ("01", lambda n: n == "Login password salah", "Autentikasi",
     "Login API dengan password salah",
     "POST /api/auth/login dengan password acak",
     "Dijawab 401", "Dijawab 401"),
    ("02", lambda n: n == "Ganti password, password lama salah", "Profil akun",
     "Ganti password dengan password lama salah",
     "PUT /api/auth/profile/password, old_password: bukan-ini",
     "Dijawab 401, password tidak berubah", "Dijawab 401"),
    ("05", lambda n: n == "Path traversal saat unduh", "Keamanan file",
     "Mengunduh file di luar folder dataset (path traversal)",
     "GET .../files/..%2F..%2F..%2Fetc%2Fpasswd/download",
     "Ditolak (400/404) dan isi /etc/passwd tidak bocor", "Ditolak, tidak bocor"),
    ("05", lambda n: n == "Hapus gambar, nama berbahaya", "Keamanan file",
     "Menghapus file di luar folder dataset",
     "DELETE .../images dengan filenames: [\"../../app/main.py\"]",
     "Dijawab 400, tidak ada file terhapus", "Dijawab 400"),
    ("05", lambda n: n == "Buat folder dengan nama kembar", "Kelola dataset",
     "Membuat folder dengan nama yang sudah ada",
     "POST /api/dataset/folders dengan nama yang sama dua kali",
     "Permintaan kedua dijawab 400", "Dijawab 400"),
    ("05", lambda n: n in ("Unggah gambar ke folder", "Unduh satu gambar", "Unduh folder sebagai zip",
                           "Unduh zip format YOLO", "Buat laporan Word", "Buat laporan Excel",
                           "Buat laporan PowerPoint", "Hapus gambar", "Hapus folder dataset"),
     "Kelola dataset",
     "Siklus data: unggah, unduh, ekspor, laporan, hapus",
     "Unggah sample_tile.jpg; unduh gambar; unduh zip biasa dan format YOLO; buat laporan Word, Excel, PPT; hapus gambar dan folder",
     "Semua langkah berhasil dengan berkas yang benar (JPEG, zip, docx)", "Semua langkah berhasil"),
    ("08", lambda n: True, "Validasi input",
     "Mengirim data yang salah ke perintah hardware",
     "Body kosong atau tipe salah ke gerak motor, grid scan, soft limit, kamera, kalibrasi, hapus sesi, laporan",
     "Ditolak 400/422 sebelum perintah dikirim ke hardware", "Semua ditolak"),
    ("07", lambda n: n == "Alat analisis tidak dikenal", "Analisis citra",
     "Memanggil alat analisis yang tidak ada",
     "POST /api/analysis/tidak-ada",
     "Dijawab 400", "Dijawab 400"),
    ("09", lambda n: n in ("Login operator yang sudah dihapus", "Token operator yang dihapus ditolak"),
     "Kelola operator (Admin)",
     "Akun yang sudah dihapus tidak bisa dipakai",
     "Admin menghapus operator; operator itu login lagi dan memakai token lamanya",
     "Login dan token lama sama-sama dijawab 401", "Keduanya dijawab 401"),
]


def playwright_status():
    if not os.path.exists(PW):
        return {}
    d = json.load(open(PW))
    out = {}

    def walk(s):
        for sp in s.get("specs", []):
            for t in sp["tests"]:
                if t.get("projectName") not in (None, "chromium"):
                    continue
                out[sp["title"]] = t["results"][-1]["status"] == "passed"
        for c in s.get("suites", []):
            walk(c)
    for s in d["suites"]:
        walk(s)
    return out


def newman_status():
    if not os.path.exists(NM):
        return []
    d = json.load(open(NM))
    folder_of = {}

    def walk(items, folder=None):
        for it in items:
            if "item" in it:
                walk(it["item"], it["name"])
            else:
                folder_of[it["id"]] = folder
    walk(d["collection"]["item"])
    rows = []
    for ex in d["run"]["executions"]:
        ok = all(not a.get("error") for a in ex.get("assertions", []))
        rows.append((folder_of.get(ex["item"]["id"], ""), ex["item"]["name"], ok, ex["response"]["code"]))
    return rows


def main():
    pw, nm = playwright_status(), newman_status()
    rows = []
    for title, fitur, skenario, langkah, harap, hasil in UI:
        if title not in pw:
            res, ok = "Belum dijalankan", None
        else:
            ok = pw[title]
            res = hasil if ok else "Tidak sesuai harapan (lihat playwright-report)"
        rows.append(("Antarmuka (Playwright)", fitur, skenario, langkah, harap, res, ok))
    for prefix, pick, fitur, skenario, langkah, harap, hasil in API:
        hits = [r for r in nm if r[0].startswith(prefix) and pick(r[1])]
        if not hits:
            res, ok = "Belum dijalankan", None
        else:
            ok = all(h[2] for h in hits)
            codes = sorted({str(h[3]) for h in hits})
            res = (f"{hasil} ({len(hits)} request, status {', '.join(codes)})" if ok
                   else f"{sum(not h[2] for h in hits)} dari {len(hits)} request tidak sesuai")
        rows.append(("API (Newman)", fitur, skenario, langkah, harap, res, ok))

    kes = lambda ok: "Valid" if ok else ("Belum diuji" if ok is None else "Tidak valid")
    valid = sum(1 for r in rows if r[6])
    head = ["No", "Jenis", "Fitur", "Skenario Uji", "Langkah Uji / Input", "Hasil yang Diharapkan",
            "Hasil Pengujian", "Kesimpulan"]
    md = ["# Pengujian Black Box", "",
          f"{len(rows)} skenario: {sum(r[0].startswith('Antarmuka') for r in rows)} lewat antarmuka web (Playwright, "
          f"Chromium desktop) dan {sum(r[0].startswith('API') for r in rows)} lewat API (Newman, ke https://e-eye.cloud). "
          f"**{valid} valid, {len(rows) - valid} tidak valid atau belum diuji.**", "",
          "Hasil Pengujian dan Kesimpulan diisi otomatis dari `frontend/e2e-results.json` dan `qa/results/newman.json`.", "",
          "| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    tsv = ["\t".join(head)]
    for i, r in enumerate(rows, 1):
        cells = [str(i), *r[:6], kes(r[6])]
        md.append("| " + " | ".join(c.replace("|", "\\|") for c in cells) + " |")
        tsv.append("\t".join(cells))
    open(OUT_MD, "w").write("\n".join(md) + "\n")
    open(OUT_TSV, "w").write("\n".join(tsv) + "\n")
    print(f"{len(rows)} skenario, {valid} valid -> {OUT_MD}")


if __name__ == "__main__":
    main()
