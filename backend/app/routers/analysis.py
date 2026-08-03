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


# ============================================================
# LOCAL OPENCV FALLBACK PROCESSOR
# Dijalankan jika Edge Device tidak merespons dalam 2 detik
# ============================================================
def process_locally(tool_name: str, input_path: str, output_path: str, params: dict) -> dict:
    """Memproses gambar secara lokal menggunakan OpenCV di server."""
    import cv2
    import numpy as np

    img = cv2.imread(input_path)
    if img is None:
        raise HTTPException(status_code=422, detail="File gambar tidak dapat dibaca oleh OpenCV")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    result_img = img.copy()
    extra = {}

    if tool_name == "adaptive-thresh":
        block_size = int(params.get("blockSize", 11))
        c_val = int(params.get("C", 2))
        if block_size % 2 == 0:
            block_size += 1
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, block_size, c_val)
        result_img = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)

    elif tool_name == "contour":
        _, binary = cv2.threshold(gray, int(params.get("threshold", 127)), 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(result_img, contours, -1, (0, 255, 0), 2)

    elif tool_name == "sobel":
        ksize = int(params.get("ksize", 3))
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=ksize)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=ksize)
        magnitude = np.sqrt(sobelx**2 + sobely**2)
        magnitude = np.clip(magnitude / magnitude.max() * 255, 0, 255).astype(np.uint8)
        result_img = cv2.cvtColor(magnitude, cv2.COLOR_GRAY2BGR)

    elif tool_name == "morphology":
        kernel_size = int(params.get("kernelSize", 5))
        operation = params.get("operation", "dilate")
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
        if operation == "erode":
            out = cv2.erode(binary, kernel, iterations=1)
        elif operation == "open":
            out = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        elif operation == "close":
            out = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        else:
            out = cv2.dilate(binary, kernel, iterations=1)
        contours, _ = cv2.findContours(out, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        result_img = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
        extra["stats"] = {"area_objects": len(contours), "kernel_size": kernel_size, "operation": operation}

    elif tool_name == "roi":
        x = int(params.get("x", 0))
        y = int(params.get("y", 0))
        w = int(params.get("w", img.shape[1] // 2))
        h = int(params.get("h", img.shape[0] // 2))
        roi = img[y:y+h, x:x+w]
        result_img = roi if roi.size > 0 else img

    elif tool_name == "calibrate":
        scale = float(params.get("scale", 1.0))
        h_new = int(img.shape[0] * scale)
        w_new = int(img.shape[1] * scale)
        result_img = cv2.resize(img, (w_new, h_new))

    elif tool_name == "color-split":
        channel = params.get("channel", "red").lower()
        b, g, r = cv2.split(img)
        zeros = np.zeros_like(b)
        if channel == "red":
            result_img = cv2.merge([zeros, zeros, r])
        elif channel == "green":
            result_img = cv2.merge([zeros, g, zeros])
        else:
            result_img = cv2.merge([b, zeros, zeros])

    elif tool_name == "colony-count":
        # Deteksi koloni dengan SimpleBlobDetector atau HoughCircles
        blurred = cv2.GaussianBlur(gray, (11, 11), 0)
        _, thresh = cv2.threshold(blurred, int(params.get("threshold", 100)), 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = int(params.get("minArea", 50))
        valid_contours = [c for c in contours if cv2.contourArea(c) > min_area]
        for i, c in enumerate(valid_contours):
            M = cv2.moments(c)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                cv2.circle(result_img, (cx, cy), 10, (0, 0, 255), 2)
                cv2.putText(result_img, str(i+1), (cx-5, cy+5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
        colony_count = len(valid_contours)
        extra["colonies"] = colony_count
        # Tulis juga JSON
        json_path = output_path.replace('.jpg', '.json').replace('.png', '.json')
        with open(json_path, 'w') as jf:
            json.dump({"colony_count": colony_count}, jf)

    else:
        # Default: grayscale
        result_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    cv2.imwrite(output_path, result_img)
    return extra


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
