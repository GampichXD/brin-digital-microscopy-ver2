from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
import os
import shutil
import uuid
import json
import base64
import asyncio
from app.redis_mock import get_redis_client
from ..schemas import ToolPayload
from ..services.cv_service import process_locally
from ..services import cv_bus
from ..hardware.motor_driver import motor_driver
from ..database import get_db
from .. import models

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
UPLOAD_DIR = "./static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/analysis", tags=["Image Analysis"])

# tool (URL) -> (aksi Redis untuk Jetson, prefix nama file output)
_ACTION_MAP = {
    "colony-count":    ("CV_COLONY_COUNT", "yolo_"),
    "adaptive-thresh": ("CV_THRESHOLD",    "edited_thresh_"),
    "contour":         ("CV_CONTOUR",      "edited_contours_"),
    "morphology":      ("CV_MORPHOLOGY",   "edited_morphology_"),
    "sobel":           ("CV_SOBEL",        "edited_sobel_"),
    "roi":             ("CV_ROI",          "edited_roi_"),
    "calibrate":       ("CV_CALIBRATE",    "edited_calibrate_"),
    "color-split":     ("CV_COLOR_SPLIT",  "edited_colorsplit_"),
}

# Computer Vision berjalan DI JETSON. YOLO TensorRT (colony-count) perlu load
# engine + inferensi -> bisa 15-40 dtk pada eksekusi pertama. CV klasik cepat.
_EDGE_TIMEOUT_S = {"colony-count": 90.0}
_EDGE_TIMEOUT_DEFAULT = 40.0


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """Upload gambar untuk dianalisis."""
    filename = f"analysis_{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": filename, "url": f"/static/uploads/{filename}"}


def _normalise_output_ext(name: str) -> str:
    """Edge selalu menulis .jpg. Samakan supaya path tunggu = path tulis."""
    stem, _ext = os.path.splitext(name)
    return stem + ".jpg"


@router.post("/{tool_name}")
async def apply_tool(tool_name: str, payload: ToolPayload, db: Session = Depends(get_db)):
    if tool_name not in _ACTION_MAP:
        raise HTTPException(status_code=400, detail="Metode Computer Vision tidak dikenali")

    action, prefix = _ACTION_MAP[tool_name]
    target_filename = payload.filename
    target_path = os.path.join(UPLOAD_DIR, target_filename)

    # Resolusi path jika file berasal dari folder dataset (bukan uploads).
    if not os.path.exists(target_path):
        src = payload.current_src or ""
        split_key = "/static/datasets/"
        if split_key in src:
            rel = "." + split_key + src.split(split_key)[-1]
            if os.path.exists(rel):
                shutil.copy(rel, target_path)
            else:
                raise HTTPException(status_code=404, detail=f"File dataset tidak ditemukan: {rel}")
        else:
            raise HTTPException(status_code=404, detail="File gambar tidak ditemukan di folder uploads")

    expected_output = _normalise_output_ext(prefix + target_filename)
    output_path = os.path.join(UPLOAD_DIR, expected_output)
    json_path = os.path.splitext(output_path)[0] + ".json"
    for stale in (output_path, json_path):
        if os.path.exists(stale):
            os.remove(stale)

    edge_online = motor_driver.jetson_websocket is not None
    params = dict(payload.params or {})
    # Colony counter: pakai ambang keyakinan dari Admin Control (SystemSetting
    # 'confThreshold', 1..100). Default 25 (= conf 0.25 bawaan Ultralytics).
    if tool_name == "colony-count" and "conf" not in params:
        row = db.query(models.SystemSetting).filter_by(key="confThreshold").first()
        try:
            pct = float(row.value) if row and row.value else 25.0
        except (TypeError, ValueError):
            pct = 25.0
        params["conf"] = max(0.01, min(0.99, pct / 100.0))
    cv_bus.clear(expected_output)

    # ── JALUR UTAMA: eksekusi DI JETSON ────────────────────────────────
    if edge_online:
        try:
            with open(target_path, "rb") as f:
                image_b64 = base64.b64encode(f.read()).decode("utf-8")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Gagal membaca gambar sumber: {e}")

        try:
            redis = await get_redis_client(REDIS_URL)
            try:
                await redis.publish("hardware_commands", json.dumps({
                    "action": action,
                    "filename": target_filename,
                    "output_name": expected_output,
                    "params": params,
                    "image_b64": image_b64,
                }))
            finally:
                await redis.close()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Gagal mengirim perintah ke Edge: {e}")

        timeout_s = _EDGE_TIMEOUT_S.get(tool_name, _EDGE_TIMEOUT_DEFAULT)
        elapsed = 0.0
        while elapsed < timeout_s and not os.path.exists(output_path):
            edge_err = cv_bus.take_error(expected_output)
            if edge_err:
                raise HTTPException(status_code=502, detail=f"Edge Device menolak proses CV: {edge_err}")
            await asyncio.sleep(0.4)
            elapsed += 0.4

        if not os.path.exists(output_path):
            edge_err = cv_bus.take_error(expected_output)
            if edge_err:
                raise HTTPException(status_code=502, detail=f"Edge Device gagal: {edge_err}")
            raise HTTPException(
                status_code=504,
                detail=f"Jetson belum menyelesaikan '{tool_name}' dalam {int(timeout_s)} dtk. "
                       f"Coba lagi, atau periksa log Edge Device.")

        extra = _read_sidecar(tool_name, json_path)
        processed_by = "edge"

    # ── FALLBACK: hanya kalau Jetson OFFLINE (mis. dev tanpa Edge) ─────
    else:
        try:
            extra = await asyncio.get_event_loop().run_in_executor(
                None, process_locally, tool_name, target_path, output_path, params
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Edge offline & pemrosesan lokal gagal: {e}")
        processed_by = "server (edge offline)"

    return {
        "status": "SUCCESS",
        "url": f"/static/uploads/{expected_output}",
        "css_filter": "brightness(1)",
        "colonies": extra.get("colonies"),
        "stats": extra.get("stats"),
        "processed_by": processed_by,
    }


def _read_sidecar(tool_name: str, json_path: str) -> dict:
    extra = {}
    if not os.path.exists(json_path):
        return extra
    try:
        with open(json_path) as jf:
            data = json.load(jf)
    except Exception:
        return extra
    if tool_name == "colony-count":
        extra["colonies"] = data.get("colony_count", 0)
    elif tool_name == "morphology":
        extra["stats"] = data
    return extra
