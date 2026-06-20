from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from . import models
from .routers import auth, dataset, hardware # Pengelompokan import router

# Otomatis menciptakan tabel di PostgreSQL kontainer Docker jika belum ada
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Digital Microscopy Control API",
    description="Backend API untuk kontrol motor CNC, Kamera IMX477, dan inferensi YOLO Colony Counter",
    version="1.0.0"
)

app.include_router(hardware.router) # Daftarkan router hardware agar bisa diakses dari frontend

# Konfigurasi CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === DAFTARKAN ROUTER DI SINI ===
app.include_router(auth.router)
app.include_router(dataset.router) # Dikelompokkan bersama di sini

@app.get("/", tags=["Health Check"])
async def root():
    return {
        "status": "ONLINE",
        "message": "Sistem API Mikroskop Digital BRIN/UNDIP Berjalan Normal",
        "hardware": {
            "jetson_orin_nano": "CONNECTED",
            "grbl_core": "READY"
        }
    }