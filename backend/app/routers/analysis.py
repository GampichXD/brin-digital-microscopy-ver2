from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import os
import shutil
import uuid
import json
import asyncio
from typing import Optional, Dict, Any
from app.redis_mock import get_redis_client

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
UPLOAD_DIR = "./static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/analysis", tags=["Image Analysis"])

class ToolPayload(BaseModel):
    filename: str
    current_src: str
    params: Optional[Dict[str, Any]] = {}

@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    # Simpan file upload lokal ke folder static
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
    
    if not os.path.exists(target_path):
        # Coba cek apakah file ini dari dataset PostgreSQL
        if "/static/datasets/" in payload.current_src:
            # path relatif dari backend root
            dataset_path = "." + payload.current_src.split(API_BASE_URL if 'API_BASE_URL' in locals() else "http://localhost:8000")[-1]
            if not dataset_path.startswith("./static/datasets/"):
                dataset_path = "." + payload.current_src.split("8000")[-1] # fallback
                
            if os.path.exists(dataset_path):
                shutil.copy(dataset_path, target_path)
            else:
                raise HTTPException(status_code=404, detail=f"File gambar dataset tidak ditemukan di server: {dataset_path}")
        else:
            raise HTTPException(status_code=404, detail="File gambar tidak ditemukan di folder uploads")

    # Prediksi nama file output berdasarkan script di Edge
    if tool_name == "colony-count":
        expected_output = f"yolo_{target_filename}"
    elif tool_name == "adaptive-thresh":
        expected_output = f"edited_thresh_{target_filename}"
    elif tool_name == "contour":
        expected_output = f"edited_contours_{target_filename}"
    elif tool_name == "morphology":
        expected_output = f"edited_morphology_{target_filename}"
    elif tool_name == "sobel":
        expected_output = f"edited_sobel_{target_filename}"
    elif tool_name == "roi":
        expected_output = f"edited_roi_{target_filename}"
    elif tool_name == "calibrate":
        expected_output = f"edited_calibrate_{target_filename}"
    elif tool_name == "color-split":
        expected_output = f"edited_colorsplit_{target_filename}"
    else:
        expected_output = f"edited_{target_filename}"

    output_path = os.path.join(UPLOAD_DIR, expected_output)
    
    # Hapus file lama jika ada (mencegah cache / false positive)
    if os.path.exists(output_path):
        os.remove(output_path)

    redis = await get_redis_client(REDIS_URL)
    try:
        # Kirim perintah ke Edge Device (vps_bridge.py)
        await redis.publish("hardware_commands", json.dumps({
            "action": action,
            "filename": target_filename,
            "params": payload.params
        }))
    finally:
        await redis.close()

    # Polling menunggu file dari Edge masuk ke direktori static/uploads (Maksimal 15 detik)
    timeout = 15
    elapsed = 0

    while elapsed < timeout:
        if os.path.exists(output_path):
            # Jika ini colony count, kita juga perlu membaca JSON output
            colonies_count = None
            stats = None
            if tool_name == "colony-count":
                json_path = os.path.join(UPLOAD_DIR, expected_output.replace('.jpg', '.json').replace('.png', '.json'))
                if os.path.exists(json_path):
                    try:
                        with open(json_path, 'r') as jf:
                            data = json.load(jf)
                            colonies_count = data.get("colony_count", 0)
                    except:
                        pass
            elif tool_name == "morphology":
                json_path = os.path.join(UPLOAD_DIR, expected_output.replace('.jpg', '.json').replace('.png', '.json'))
                if os.path.exists(json_path):
                    try:
                        with open(json_path, 'r') as jf:
                            stats = json.load(jf)
                    except:
                        pass

            return {
                "status": "SUCCESS", 
                "url": f"/static/uploads/{expected_output}",
                "css_filter": "brightness(1)",
                "colonies": colonies_count,
                "stats": stats
            }
            
        await asyncio.sleep(0.5)
        elapsed += 0.5
        
    raise HTTPException(status_code=504, detail="Timeout: Edge Device gagal merespon proses Computer Vision")
