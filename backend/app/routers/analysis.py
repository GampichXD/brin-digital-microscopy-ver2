from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import shutil
import uuid
import json
import asyncio
from app.redis_mock import get_redis_client
from ..schemas import ToolPayload
from ..services.cv_service import process_locally

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
UPLOAD_DIR = "./static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/analysis", tags=["Image Analysis"])

@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """Upload gambar untuk dianalisis."""
    filename = f"analysis_{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": filename, "url": f"/static/uploads/{filename}"}


@router.post("/{tool_name}")
async def apply_tool(tool_name: str, payload: ToolPayload):
    action_map = {
        "colony-count": "CV_COLONY_COUNT",
        "adaptive-thresh": "CV_THRESHOLD",
        "contour": "CV_CONTOUR",
        "morphology": "CV_MORPHOLOGY",
        "sobel": "CV_SOBEL",
        "roi": "CV_ROI",
        "calibrate": "CV_CALIBRATE",
        "color-split": "CV_COLOR_SPLIT"
    }

    if tool_name not in action_map:
        raise HTTPException(status_code=400, detail="Metode Computer Vision tidak dikenali")

    action = action_map[tool_name]
    target_filename = payload.filename
    target_path = os.path.join(UPLOAD_DIR, target_filename)

    # Resolusi path jika file dari dataset
    if not os.path.exists(target_path):
        if "/static/datasets/" in payload.current_src:
            # Ambil path relative dari URL backend
            src = payload.current_src
            split_key = "/static/datasets/"
            if split_key in src:
                rel = "." + split_key + src.split(split_key)[-1]
                if os.path.exists(rel):
                    shutil.copy(rel, target_path)
                else:
                    raise HTTPException(status_code=404, detail=f"File dataset tidak ditemukan: {rel}")
            else:
                raise HTTPException(status_code=404, detail="Path dataset tidak valid")
        else:
            raise HTTPException(status_code=404, detail="File gambar tidak ditemukan di folder uploads")

    # Tentukan nama file output
    prefix_map = {
        "colony-count": "yolo_",
        "adaptive-thresh": "edited_thresh_",
        "contour": "edited_contours_",
        "morphology": "edited_morphology_",
        "sobel": "edited_sobel_",
        "roi": "edited_roi_",
        "calibrate": "edited_calibrate_",
        "color-split": "edited_colorsplit_",
    }
    expected_output = prefix_map.get(tool_name, "edited_") + target_filename
    output_path = os.path.join(UPLOAD_DIR, expected_output)

    # Hapus output lama jika ada (cegah false positive)
    if os.path.exists(output_path):
        os.remove(output_path)

    # Kirim perintah ke Edge Device (Jetson via Redis)
    try:
        redis = await get_redis_client(REDIS_URL)
        try:
            await redis.publish("hardware_commands", json.dumps({
                "action": action,
                "filename": target_filename,
                "params": payload.params
            }))
        finally:
            await redis.close()
    except Exception:
        pass  # Redis mungkin tidak tersedia, lanjut ke fallback

    # Tunggu response dari Edge Device (maks 2 detik)
    elapsed = 0
    edge_timeout = 2.0
    while elapsed < edge_timeout:
        if os.path.exists(output_path):
            break
        await asyncio.sleep(0.25)
        elapsed += 0.25

    # Jika Edge Device tidak merespons → proses secara lokal dengan OpenCV
    if not os.path.exists(output_path):
        try:
            extra = await asyncio.get_event_loop().run_in_executor(
                None, process_locally, tool_name, target_path, output_path, payload.params or {}
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gagal memproses gambar secara lokal: {str(e)}")
    else:
        # Edge Device berhasil — baca data tambahan jika ada
        extra = {}
        if tool_name == "colony-count":
            json_path = output_path.replace('.jpg', '.json').replace('.png', '.json')
            if os.path.exists(json_path):
                try:
                    with open(json_path) as jf:
                        data = json.load(jf)
                        extra["colonies"] = data.get("colony_count", 0)
                except Exception:
                    pass
        elif tool_name == "morphology":
            json_path = output_path.replace('.jpg', '.json').replace('.png', '.json')
            if os.path.exists(json_path):
                try:
                    with open(json_path) as jf:
                        extra["stats"] = json.load(jf)
                except Exception:
                    pass

    return {
        "status": "SUCCESS",
        "url": f"/static/uploads/{expected_output}",
        "css_filter": "brightness(1)",
        "colonies": extra.get("colonies"),
        "stats": extra.get("stats"),
        "processed_by": "edge" if elapsed < edge_timeout else "server"
    }
