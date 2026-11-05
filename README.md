# Digital Microscopy (BRIN x UNDIP)

Antarmuka web untuk mikroskop digital berbasis CNC. Repo ini berisi backend, frontend, dan konfigurasi deploy. Kode perangkat tepi ada di repo terpisah, `brin-edgedevice-microscopy-ver2`.

## Arsitektur

```
Browser (React) <-> nginx <-> FastAPI (VPS) <-> Jetson Orin Nano (GRBL, kamera IMX477)
                               |- PostgreSQL: akun, folder dataset, log, setting
                               |- Redis: pub/sub perintah dan telemetri
```

- `/api/hardware/client/ws?token=<JWT>` menghubungkan browser dengan VPS.
- `/api/hardware/ws?device_token=<token>` menghubungkan Jetson dengan VPS. VPS mengirim `{"action": "PING"}` tiap 1 detik sebagai sumber watchdog Jetson.
- Push ke `main` otomatis deploy ke e-eye.cloud lewat self-hosted runner. Kerjakan perubahan di branch lain.

## Menjalankan

```bash
cp .env.example .env    # lalu isi semua nilainya
docker compose up --build
docker exec -it mikroskop_backend python create_admin.py <username>
```

Aplikasi terbuka di `http://localhost`. Backend hanya terikat ke `127.0.0.1:8000`, jadi akses dari luar selalu lewat nginx.

## Variabel lingkungan

| Variabel | Wajib | Keterangan |
|---|---|---|
| `JWT_SECRET_KEY` | Ya | Kunci tanda tangan JWT. Mengganti nilainya membuat semua pengguna logout. |
| `EDGE_DEVICE_TOKEN` | Ya | Autentikasi Jetson. Harus sama dengan `.env` di Jetson. |
| `EDGE_TOKEN_REQUIRED` | Tidak | Default `true`. Isi `false` hanya selama transisi, saat VPS di-deploy lebih dulu dari Jetson. |
| `POSTGRES_PASSWORD` | Disarankan | Default `postgres`. Lihat bagian berikutnya sebelum mengganti. |
| `NGROK_AUTHTOKEN` | Tidak | Untuk kontainer ngrok. |

## Akun admin

Registrasi publik selalu menghasilkan peran `OPERATOR`. Admin pertama dibuat dengan `create_admin.py`, dan peran bisa diubah dari tab Admin Control.

## Mengganti password Postgres

Mengubah `POSTGRES_PASSWORD` di env tidak mengubah password volume yang sudah ada. Ubah lewat SQL dulu, baru isi `.env` dan restart backend:

```bash
docker exec -it mikroskop_postgres psql -U postgres -c "ALTER USER postgres PASSWORD '<baru>';"
```

Password dipakai di dalam `DATABASE_URL`, jadi gunakan karakter yang aman untuk URL, misalnya hasil `python -c "import secrets;print(secrets.token_urlsafe(32))"`.

## Pengujian

```bash
scripts/run_all_tests.sh        # semua tes, hasil di qa/results/
cd backend && pytest -m unit    # atau: integration, security
```

Tes backend memakai database dan folder kerja sementara, sehingga tidak menyentuh `microscopy.db` maupun `static/`. Tes Playwright butuh stack yang hidup dan env `E2E_ADMIN_USER`, `E2E_ADMIN_PASS`, serta `BASE_URL` (opsional).

## Keterbatasan yang diketahui

- `/static/*` masih publik, termasuk citra dataset.
- Token JWT muncul di query string untuk WebSocket, unduhan, dan pemutar video, sehingga bisa tercatat di access log.
