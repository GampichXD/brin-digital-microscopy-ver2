from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from .database import engine
from . import models  # Pastikan path ini sesuai dengan file struktur modelmu
from .routers import auth, dataset, hardware, analysis, documentation, logs

# 🟢 LANGKAH 1: Pastikan tabel database PostgreSQL tercipta sukses di awal sebelum router memicu request
app = FastAPI(
    title="Digital Microscopy Control API",
    description="Backend API untuk kontrol motor CNC, Kamera IMX477, dan inferensi YOLO Colony Counter",
    version="1.0.0"
)


@app.on_event("startup")
async def startup_event():
    print("[API STARTUP] Menyambungkan ke PostgreSQL dan sinkronisasi skema tabel...")
    import time
    for i in range(5):
        try:
            models.Base.metadata.create_all(bind=engine)
            print("[API STARTUP SUCCESS] PostgreSQL siap dan sinkronisasi berhasil.")
            break
        except Exception as exc:
            print(f"[API STARTUP WARNING] PostgreSQL belum siap (Percobaan {i+1}/5): {exc}")
            time.sleep(3)
            
# Pastikan folder static ada
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Konfigurasi CORS (Cross-Origin Resource Sharing)
origins = [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:80",
    "http://127.0.0.1:80",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://202.10.44.52",
    "http://e-eye.cloud",
    "https://e-eye.cloud"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🟢 LANGKAH 2: Daftarkan seluruh router secara berkelompok di fase akhir setelah sirkuit core server siap
print("[API STARTUP] Mendaftarkan sirkuit pipa data router ke jaringan...")
app.include_router(auth.router)
app.include_router(dataset.router)
app.include_router(hardware.router)
app.include_router(analysis.router)
app.include_router(documentation.router)  # Report generator: Word, Excel, PPT
app.include_router(logs.router)

# Penanda build — ganti string ini setiap deploy untuk memastikan kontainer
# yang berjalan benar-benar memuat kode terbaru.
# Cek publik lewat browser: https://e-eye.cloud/api/version
BUILD_MARKER = "2026-09-02-stitch-resume-bigstitch-agdefaults"

@app.get("/", tags=["Health Check"])
async def root():
    return {
        "status": "ONLINE",
        "message": "Sistem API Mikroskop Digital BRIN/UNDIP Berjalan Normal",
        "build": BUILD_MARKER,
        "hardware": {
            "jetson_orin_nano": "CONNECTED",
            "grbl_core": "READY"
        }
    }

@app.get("/api/version", tags=["Health Check"])
async def version():
    """Bisa dibuka langsung di browser (nginx meneruskan /api/ ke backend)."""
    return {"build": BUILD_MARKER}