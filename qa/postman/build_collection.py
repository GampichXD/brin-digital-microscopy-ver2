#!/usr/bin/env python3
"""Bangun koleksi Postman untuk API Mikroskop Digital.

    python3 qa/postman/build_collection.py

Keluaran: qa/postman/Digital_Microscopy_API_QoS.postman_collection.json
(bisa di-import ke Postman, atau dijalankan Newman lewat scripts/run_all_tests.sh).

Aman untuk situs live: endpoint yang menggerakkan CNC, memulai scan/stitching,
mengubah konfigurasi, me-restart Edge, atau menghapus data massal hanya diuji
penolakan aksesnya (401 tanpa token, 403 untuk operator non-admin, 422 untuk body
salah). Data yang dibuat koleksi ini (satu akun operator dan satu folder dataset
bernama "Newman Uji <waktu>") dihapus lagi di akhir.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Digital_Microscopy_API_QoS.postman_collection.json")

FORGED_JWT = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
              "eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJBRE1JTiJ9."
              "c2lnbmF0dXJlLXBhbHN1LXRpZGFrLXZhbGlk")


def _url(path):
    raw = "{{baseUrl}}" + path
    base, _, query = path.partition("?")
    url = {"raw": raw, "host": ["{{baseUrl}}"],
           "path": [p for p in base.strip("/").split("/") if p]}
    if query:
        url["query"] = [dict(zip(("key", "value"), kv.split("=", 1))) for kv in query.split("&")]
    return url


def req(name, method, path, expect, auth="admin", body=None, form=None, tests="", pre="",
        headers=None):
    """expect: kode status yang diterima (int atau list)."""
    codes = expect if isinstance(expect, list) else [expect]
    hdr = [{"key": k, "value": v} for k, v in (headers or {}).items()]
    if auth == "admin":
        hdr.append({"key": "Authorization", "value": "Bearer {{adminToken}}"})
    elif auth == "op":
        hdr.append({"key": "Authorization", "value": "Bearer {{opToken}}"})
    elif auth == "forged":
        hdr.append({"key": "Authorization", "value": "Bearer " + FORGED_JWT})
    request = {"method": method, "header": hdr, "url": _url(path)}
    if body is not None:
        hdr.append({"key": "Content-Type", "value": "application/json"})
        request["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2)}
    if form is not None:
        request["body"] = {"mode": "formdata", "formdata": form}
    test_src = (f"pm.test('Status {' / '.join(map(str, codes))}', function () {{\n"
                f"    pm.expect(pm.response.code).to.be.oneOf({json.dumps(codes)});\n}});\n"
                "pm.test('Waktu respons < 5 detik', function () {\n"
                "    pm.expect(pm.response.responseTime).to.be.below(5000);\n});\n" + tests)
    events = [{"listen": "test", "script": {"type": "text/javascript", "exec": test_src.splitlines()}}]
    if pre:
        events.append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": pre.splitlines()}})
    return {"name": name, "event": events, "request": request}


def folder(name, items, description=""):
    return {"name": name, "description": description, "item": items}


SAMPLE = [{"key": "files", "type": "file", "src": "sample_tile.jpg"}]

# Endpoint terlindungi: (nama, metode, path, body contoh). Dipakai untuk uji 401.
PROTECTED = [
    ("Daftar operator", "GET", "/api/auth/operators", None),
    ("Ubah peran operator", "PUT", "/api/auth/operators/0/role", {"role": "OPERATOR"}),
    ("Hapus operator", "DELETE", "/api/auth/operators/0", None),
    ("Reset password", "PUT", "/api/auth/reset-password", {"user_id": 0}),
    ("Ganti password sendiri", "PUT", "/api/auth/profile/password", {"old_password": "x", "new_password": "y"}),
    ("Buat folder dataset", "POST", "/api/dataset/folders", {"name": "x", "object_type": "x", "date": "x", "operator": "x"}),
    ("Daftar folder dataset", "GET", "/api/dataset/folders", None),
    ("Ubah folder dataset", "PUT", "/api/dataset/folders/x", {"name": "x", "object_type": "x", "operator": "x"}),
    ("Hapus folder dataset", "DELETE", "/api/dataset/folders/x", None),
    ("Tambah jumlah gambar", "PUT", "/api/dataset/folders/x/add-images", {"count": 0, "filenames": []}),
    ("Daftar gambar folder", "GET", "/api/dataset/folders/x/images", None),
    ("Unggah file ke folder", "POST", "/api/dataset/folders/x/files", None),
    ("Unduh satu file", "GET", "/api/dataset/folders/x/files/a.jpg/download", None),
    ("Hapus gambar", "DELETE", "/api/dataset/folders/x/images", {"filenames": []}),
    ("Unduh folder (zip)", "GET", "/api/dataset/folders/x/download", None),
    ("Putar video", "GET", "/api/dataset/video/x/a.mp4", None),
    ("Info penyimpanan", "GET", "/api/dataset/storage-info", None),
    ("Indeks sinkronisasi", "GET", "/api/dataset/vps/sync-index", None),
    ("Ekspor semua dataset", "GET", "/api/dataset/storage/export", None),
    ("Purge cache", "DELETE", "/api/dataset/storage/purge-cache", None),
    ("Purge all", "DELETE", "/api/dataset/storage/purge-all", None),
    ("Konfigurasi sistem", "GET", "/api/hardware/config", None),
    ("Konfigurasi AI", "PUT", "/api/hardware/config/ai", {"confThreshold": 25}),
    ("Default Auto Gather", "PUT", "/api/hardware/config/autogather", {}),
    ("Reset konfigurasi", "POST", "/api/hardware/config/ai/default", None),
    ("Aksi admin room", "POST", "/api/hardware/room/admin_action", {"cid": "x", "action": "KICK"}),
    ("Gerak motor", "POST", "/api/hardware/motor/move", {"axis": "X", "value": 0, "feed_rate": 100, "unit": "mm"}),
    ("Homing motor", "POST", "/api/hardware/motor/home", None),
    ("Unlock motor", "POST", "/api/hardware/motor/unlock", None),
    ("Set posisi motor", "POST", "/api/hardware/motor/set-position", {"x": 0, "y": 0, "z": 0}),
    ("Restart Edge", "POST", "/api/hardware/edge/restart", None),
    ("Pengaturan kamera", "POST", "/api/hardware/camera/settings", {"shutter_speed": 1000, "iso": 100}),
    ("Kalibrasi flat/dark", "POST", "/api/hardware/camera/flatfield?mode=flat", None),
    ("Pengaturan CNC", "POST", "/api/hardware/cnc/settings", {"feed_rate": 100, "backlash": 0, "acceleration": 10, "settle_time": 100}),
    ("Soft limit CNC", "POST", "/api/hardware/cnc/soft-limits", {"enabled": False}),
    ("Mulai grid scan", "POST", "/api/hardware/scan/grid", {"columns": 1, "rows": 1, "step_x": 1, "step_y": 1, "delay_ms": 100, "unit": "mm", "start_x": 0, "start_y": 0}),
    ("Status scan", "GET", "/api/hardware/scan/status", None),
    ("Batalkan scan", "POST", "/api/hardware/scan/cancel", None),
    ("Hapus hasil sesi scan", "DELETE", "/api/hardware/scan/session/newman_none", None),
    ("Retake tile", "POST", "/api/hardware/scan/retake", {"coord_x": 0, "coord_y": 0, "filename": "a.jpg", "delay_ms": 100}),
    ("Mulai stitching", "POST", "/api/hardware/stitch", {"images": []}),
    ("Status stitching", "GET", "/api/hardware/stitch/status", None),
    ("Tempatkan tile (unggah)", "POST", "/api/hardware/stitch/place", None),
    ("Tempatkan tile dari dataset", "POST", "/api/hardware/stitch/place-from-dataset", {"folder_id": "x", "image_name": "a.jpg", "grid_x": 0, "grid_y": 0}),
    ("Tempatkan satu folder", "POST", "/api/hardware/stitch/place-folder", {"folder_id": "x", "rows": 1, "columns": 1}),
    ("Hardware bus", "POST", "/api/hardware/bus/toggle", {"enabled": True}),
    ("Unggah citra analisis", "POST", "/api/analysis/upload", None),
    ("Jalankan alat analisis", "POST", "/api/analysis/sobel", {"filename": "a.jpg", "current_src": ""}),
    ("Status analisis", "GET", "/api/analysis/status?output=a.jpg", None),
    ("Buat laporan", "POST", "/api/documentation/generate?format=WORD", {"folder_id": "x"}),
    ("Lihat log", "GET", "/api/logs", None),
    ("Tulis log", "POST", "/api/logs", {"operator": "x", "action": "x"}),
    ("Hapus semua log", "DELETE", "/api/logs", None),
]

# Khusus admin: operator biasa harus mendapat 403.
ADMIN_ONLY = [
    "Daftar operator", "Ubah peran operator", "Hapus operator", "Reset password",
    "Ekspor semua dataset", "Purge cache", "Purge all", "Konfigurasi AI", "Default Auto Gather",
    "Reset konfigurasi", "Aksi admin room", "Set posisi motor", "Restart Edge",
    "Kalibrasi flat/dark", "Pengaturan CNC", "Soft limit CNC", "Hardware bus", "Hapus semua log",
]

items = []

# ---------------------------------------------------------------- 01 Publik
items.append(folder("01 Publik dan login", [
    # Di situs live nginx menyajikan frontend di "/", hanya /api/ yang diteruskan ke
    # backend. GET / milik backend (health check) hanya terjangkau dari VPS sendiri.
    req("Halaman web (frontend)", "GET", "/", 200, auth="none",
        tests="pm.test('Berupa HTML', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('text/html'));\n"
              "pm.test('Header keamanan ada', () => {\n"
              "    pm.expect(pm.response.headers.get('X-Content-Type-Options')).to.eql('nosniff');\n"
              "    pm.expect(pm.response.headers.get('X-Frame-Options')).to.eql('SAMEORIGIN');\n});"),
    req("Versi build", "GET", "/api/version", 200, auth="none",
        tests="pm.test('Ada build', () => pm.expect(pm.response.json().build).to.be.a('string'));"),
    req("Statistik telemetri", "GET", "/api/hardware/telemetry/stats", 200, auth="none",
        tests="pm.test('Ada edgeOnline', () => pm.expect(pm.response.json()).to.have.property('edgeOnline'));"),
    req("Login password salah", "POST", "/api/auth/login", 401, auth="none",
        body={"username": "{{adminUser}}", "password": "salah-{{$timestamp}}"}),
    req("Login admin", "POST", "/api/auth/login", 200, auth="none",
        body={"username": "{{adminUser}}", "password": "{{adminPass}}"},
        tests="const j = pm.response.json();\n"
              "pm.test('Dapat token', () => pm.expect(j.access_token).to.be.a('string'));\n"
              "pm.test('Peran ADMIN', () => pm.expect(j.role).to.eql('ADMIN'));\n"
              "pm.collectionVariables.set('adminToken', j.access_token);"),
], "Endpoint yang boleh diakses tanpa login."))

# ---------------------------------------------------------------- 02 Akun operator uji
items.append(folder("02 Akun operator uji", [
    req("Registrasi operator", "POST", "/api/auth/register", 201, auth="none",
        body={"username": "{{opUser}}", "password": "{{opPass}}"},
        pre="const run = Date.now();\n"
            "pm.collectionVariables.set('runId', run);\n"
            "pm.collectionVariables.set('opUser', 'newman_' + run);\n"
            "pm.collectionVariables.set('opPass', 'Uji-' + Math.random().toString(36).slice(2, 12));",
        tests="pm.test('Selalu OPERATOR', () => pm.expect(pm.response.json().message).to.include('OPERATOR'));"),
    req("Registrasi username kembar", "POST", "/api/auth/register", 400, auth="none",
        body={"username": "{{opUser}}", "password": "{{opPass}}"}),
    req("Login operator", "POST", "/api/auth/login", 200, auth="none",
        body={"username": "{{opUser}}", "password": "{{opPass}}"},
        tests="const j = pm.response.json();\n"
              "pm.test('Peran OPERATOR', () => pm.expect(j.role).to.eql('OPERATOR'));\n"
              "pm.collectionVariables.set('opToken', j.access_token);"),
    req("Daftar operator (admin)", "GET", "/api/auth/operators", 200,
        tests="const me = pm.response.json().find(u => u.username === pm.collectionVariables.get('opUser'));\n"
              "pm.test('Operator uji ada di daftar', () => pm.expect(me).to.be.an('object'));\n"
              "if (me) pm.collectionVariables.set('opId', me.id);"),
    req("Ganti password, password lama salah", "PUT", "/api/auth/profile/password", 401, auth="op",
        body={"old_password": "bukan-ini", "new_password": "apa-saja"}),
    req("Ganti password sendiri", "PUT", "/api/auth/profile/password", 200, auth="op",
        body={"old_password": "{{opPass}}", "new_password": "{{opPass}}-baru"},
        tests="pm.collectionVariables.set('opPass', pm.collectionVariables.get('opPass') + '-baru');"),
    req("Login dengan password baru", "POST", "/api/auth/login", 200, auth="none",
        body={"username": "{{opUser}}", "password": "{{opPass}}"},
        tests="pm.collectionVariables.set('opToken', pm.response.json().access_token);"),
    req("Ubah peran operator (admin)", "PUT", "/api/auth/operators/{{opId}}/role", 200,
        body={"role": "OPERATOR"}),
    req("Ubah peran, ID tidak ada", "PUT", "/api/auth/operators/999999999/role", 404,
        body={"role": "OPERATOR"}),
    req("Reset password operator (admin)", "PUT", "/api/auth/reset-password", 200,
        body={"user_id": "{{opId}}"}),
], "Membuat satu akun operator sementara, dihapus lagi di folder 09."))

# ---------------------------------------------------------------- 03 Tanpa token
no_token = [req(f"{n} tanpa token", m, p, 401, auth="none", body=b) for n, m, p, b in PROTECTED]
no_token += [
    req("Daftar folder dengan JWT palsu", "GET", "/api/dataset/folders", 401, auth="forged"),
    req("Purge all dengan JWT palsu", "DELETE", "/api/dataset/storage/purge-all", 401, auth="forged"),
    req("Indeks sinkron dengan token edge salah", "GET", "/api/dataset/vps/sync-index", 401, auth="none",
        headers={"X-Edge-Token": "token-edge-salah"}),
]
items.append(folder("03 Tanpa token ditolak (401)", no_token,
                    "Semua endpoint selain folder 01 wajib membawa token JWT."))

# ---------------------------------------------------------------- 04 Operator non-admin
by_name = {n: (m, p, b) for n, m, p, b in PROTECTED}
items.append(folder("04 Operator ditolak di fitur admin (403)", [
    req(f"{n} sebagai operator", by_name[n][0], by_name[n][1], 403, auth="op", body=by_name[n][2])
    for n in ADMIN_ONLY
], "Operator yang sudah login tetap tidak boleh memakai fitur khusus Admin."))

# ---------------------------------------------------------------- 05 Siklus dataset
items.append(folder("05 Siklus folder dataset", [
    req("Buat folder dataset", "POST", "/api/dataset/folders", 201,
        body={"name": "Newman Uji {{runId}}", "object_type": "Uji API", "date": "{{runId}}", "operator": "newman"},
        tests="const j = pm.response.json();\n"
              "pm.test('Dapat ID folder', () => pm.expect(j.id).to.be.a('string'));\n"
              "pm.collectionVariables.set('folderId', j.id);"),
    req("Buat folder dengan nama kembar", "POST", "/api/dataset/folders", 400,
        body={"name": "Newman Uji {{runId}}", "object_type": "Uji API", "date": "x", "operator": "newman"}),
    req("Daftar folder dataset", "GET", "/api/dataset/folders", 200,
        tests="pm.test('Folder uji ada', () => pm.expect(pm.response.json().map(f => f.id)).to.include(pm.collectionVariables.get('folderId')));"),
    req("Ubah nama folder", "PUT", "/api/dataset/folders/{{folderId}}", 200,
        body={"name": "Newman Uji {{runId}} (ubah)", "object_type": "Uji API", "operator": "newman"},
        tests="pm.test('Nama berubah', () => pm.expect(pm.response.json().name).to.include('(ubah)'));"),
    req("Unggah gambar ke folder", "POST", "/api/dataset/folders/{{folderId}}/files", 200, form=SAMPLE,
        tests="pm.test('Jumlah gambar 1', () => pm.expect(pm.response.json().current_image_count).to.eql(1));"),
    req("Daftar gambar folder", "GET", "/api/dataset/folders/{{folderId}}/images", 200,
        tests="const img = pm.response.json().find(i => i.name === 'sample_tile.jpg');\n"
              "pm.test('Gambar ada dan bertanda synced', () => pm.expect(img && img.synced).to.eql(true));"),
    req("Unduh satu gambar", "GET", "/api/dataset/folders/{{folderId}}/files/sample_tile.jpg/download", 200,
        tests="pm.test('Berupa JPEG', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('image/jpeg'));"),
    req("Unduh file yang tidak ada", "GET", "/api/dataset/folders/{{folderId}}/files/tidak_ada.jpg/download", 404),
    req("Path traversal saat unduh", "GET", "/api/dataset/folders/{{folderId}}/files/..%2F..%2F..%2Fetc%2Fpasswd/download", [400, 404],
        tests="pm.test('Isi /etc/passwd tidak bocor', () => pm.expect(pm.response.text()).to.not.include('root:'));"),
    req("Unduh folder sebagai zip", "GET", "/api/dataset/folders/{{folderId}}/download", 200,
        tests="pm.test('Berupa zip', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('zip'));"),
    req("Unduh zip dengan token di URL", "GET", "/api/dataset/folders/{{folderId}}/download?token={{adminToken}}", 200, auth="none"),
    req("Unduh zip format YOLO", "GET", "/api/dataset/folders/{{folderId}}/download?format=yolo", 200),
    req("Putar video yang tidak ada", "GET", "/api/dataset/video/{{folderId}}/tidak_ada.mp4?token={{adminToken}}", 404, auth="none"),
    req("Buat laporan Word", "POST", "/api/documentation/generate?format=WORD", 200,
        body={"folder_id": "{{folderId}}", "folder_name": "Newman Uji", "author": "newman"},
        tests="pm.test('Berupa dokumen Word', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('wordprocessingml'));"),
    req("Buat laporan Excel", "POST", "/api/documentation/generate?format=EXCEL", 200,
        body={"folder_id": "{{folderId}}", "folder_name": "Newman Uji", "author": "newman"}),
    req("Buat laporan PowerPoint", "POST", "/api/documentation/generate?format=PPT", 200,
        body={"folder_id": "{{folderId}}", "folder_name": "Newman Uji", "author": "newman"}),
    req("Tambah jumlah gambar (0)", "PUT", "/api/dataset/folders/{{folderId}}/add-images", 200,
        body={"count": 0, "filenames": []}),
    req("Hapus gambar, nama berbahaya", "DELETE", "/api/dataset/folders/{{folderId}}/images", 400,
        body={"filenames": ["../../app/main.py"]}),
    req("Hapus gambar", "DELETE", "/api/dataset/folders/{{folderId}}/images", 200,
        body={"filenames": ["sample_tile.jpg"]},
        tests="pm.test('Jumlah gambar kembali 0', () => pm.expect(pm.response.json().current_image_count).to.eql(0));"),
    req("Hapus folder dataset", "DELETE", "/api/dataset/folders/{{folderId}}", 200),
    req("Hapus folder yang sudah dihapus", "DELETE", "/api/dataset/folders/{{folderId}}", 404),
], "Membuat satu folder sementara, mengisinya, mengunduh, membuat laporan, lalu menghapusnya."))

# ---------------------------------------------------------------- 06 Baca data
items.append(folder("06 Baca status dan konfigurasi", [
    req("Info penyimpanan", "GET", "/api/dataset/storage-info", 200),
    req("Indeks sinkronisasi", "GET", "/api/dataset/vps/sync-index", 200),
    req("Konfigurasi sistem", "GET", "/api/hardware/config", 200),
    req("Status scan", "GET", "/api/hardware/scan/status", 200),
    req("Status stitching", "GET", "/api/hardware/stitch/status", 200),
    req("Tulis log aktivitas", "POST", "/api/logs", 200,
        body={"operator": "newman", "action": "Uji API otomatis (Newman)", "status": "SUCCESS"}),
    req("Lihat log aktivitas", "GET", "/api/logs?limit=20", 200,
        tests="pm.test('Log uji tercatat', () => pm.expect(pm.response.json().map(l => l.action)).to.include('Uji API otomatis (Newman)'));"),
], "Endpoint baca saja, ditambah satu entri log aktivitas."))

# ---------------------------------------------------------------- 07 Analisis
items.append(folder("07 Analisis citra", [
    req("Unggah citra untuk analisis", "POST", "/api/analysis/upload", 200,
        form=[{"key": "file", "type": "file", "src": "sample_tile.jpg"}],
        tests="pm.collectionVariables.set('analysisFile', pm.response.json().filename);"),
    req("Jalankan Sobel", "POST", "/api/analysis/sobel", 200,
        body={"filename": "{{analysisFile}}", "current_src": "", "params": {}},
        tests="const j = pm.response.json();\n"
              "pm.test('Status STARTED', () => pm.expect(j.status).to.eql('STARTED'));\n"
              "pm.collectionVariables.set('analysisOutput', j.output);"),
    req("Alat analisis tidak dikenal", "POST", "/api/analysis/tidak-ada", 400,
        body={"filename": "{{analysisFile}}", "current_src": ""}),
    req("Status analisis", "GET", "/api/analysis/status?output={{analysisOutput}}", 200,
        tests="pm.test('Ada field done', () => pm.expect(pm.response.json()).to.have.property('done'));"),
], "Satu operasi ringan (Sobel). Diproses di Jetson kalau online, di VPS kalau offline."))

# ---------------------------------------------------------------- 08 Validasi
items.append(folder("08 Validasi input ditolak (422/400)", [
    req("Gerak motor tanpa body", "POST", "/api/hardware/motor/move", 422),
    req("Grid scan tanpa body", "POST", "/api/hardware/scan/grid", 422),
    req("Soft limit dengan tipe salah", "POST", "/api/hardware/cnc/soft-limits", 422,
        body={"enabled": "bukan-boolean", "x_min": "abc"}),
    req("Pengaturan kamera tanpa body", "POST", "/api/hardware/camera/settings", 422),
    req("Hapus sesi scan, ID tidak sah", "DELETE", "/api/hardware/scan/session/sesi.tidak.sah", [400, 422]),
    req("Kalibrasi flat/dark, mode salah", "POST", "/api/hardware/camera/flatfield?mode=salah", 422),
    req("Laporan, format tidak dikenal", "POST", "/api/documentation/generate?format=PDF", [400, 404, 422],
        body={"folder_id": "tidak-ada"}),
], "Body yang salah ditolak sebelum perintah apa pun dikirim ke hardware."))

# ---------------------------------------------------------------- 09 Bersihkan
items.append(folder("09 Bersihkan akun uji", [
    req("Login operator dengan password reset", "POST", "/api/auth/login", 200, auth="none",
        body={"username": "{{opUser}}", "password": "123456"}),
    req("Hapus operator uji (admin)", "DELETE", "/api/auth/operators/{{opId}}", 200),
    req("Login operator yang sudah dihapus", "POST", "/api/auth/login", 401, auth="none",
        body={"username": "{{opUser}}", "password": "123456"}),
    req("Token operator yang dihapus ditolak", "GET", "/api/dataset/folders", 401, auth="op"),
], "Menghapus akun operator sementara."))

collection = {
    "info": {
        "name": "Digital Microscopy API QoS",
        "description": __doc__,
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    "item": items,
    "variable": [{"key": k, "value": v} for k, v in {
        "baseUrl": "https://e-eye.cloud", "adminUser": "", "adminPass": "", "adminToken": "",
        "runId": "", "opUser": "", "opPass": "", "opToken": "", "opId": "",
        "folderId": "", "analysisFile": "", "analysisOutput": ""}.items()],
}

with open(OUT, "w") as f:
    json.dump(collection, f, indent=2, ensure_ascii=False)
total = sum(len(i["item"]) for i in items)
print(f"{total} request di {len(items)} folder -> {OUT}")
