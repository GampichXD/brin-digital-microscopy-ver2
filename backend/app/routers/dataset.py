import uuid
import os
import shutil
import zipfile
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import FileResponse, StreamingResponse, Response
from datetime import datetime
from sqlalchemy.orm import Session
from ..schemas import FolderCreate, FolderUpdate, FolderResponse, ImageCountIncrement, DeleteImagesPayload
from typing import List
from ..database import get_db
from .. import models


DATASET_DIR = "./static/datasets"
os.makedirs(DATASET_DIR, exist_ok=True)

router = APIRouter(
    prefix="/api/dataset",
    tags=["Dataset Management"]
)

# --- ENDPOINT 1: BUAT FOLDER DATASET BARU ---
@router.post("/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(folder_data: FolderCreate, db: Session = Depends(get_db)):
    # Cek unik: nama folder tidak boleh kembar di database server
    existing_folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.name == folder_data.name).first()
    if existing_folder:
        raise HTTPException(status_code=400, detail="Nama folder dataset sudah digunakan!")

    # Generate UUID unik sebagai ID string folder
    new_id = str(uuid.uuid4())[:8] # Ambil 8 karakter depan agar ringkas di URL

    new_folder = models.DatasetFolder(
        id=new_id,
        name=folder_data.name,
        object_type=folder_data.object_type,
        date=folder_data.date,
        operator=folder_data.operator,
        image_count=0 # Inisialisasi awal, citra masih kosong
    )
    
    # Buat direktori fisik
    os.makedirs(os.path.join(DATASET_DIR, new_id), exist_ok=True)

    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

# --- ENDPOINT 2: AMBIL SEMUA DAFTAR FOLDER DATASET ---
@router.get("/folders", response_model=List[FolderResponse])
def get_all_folders(db: Session = Depends(get_db)):
    folders = db.query(models.DatasetFolder).all()
    
    # Auto-sync physical file count with database to prevent mismatch
    dirty = False
    for folder in folders:
        folder_path = os.path.join(DATASET_DIR, folder.id)
        if os.path.exists(folder_path):
            files = os.listdir(folder_path)
            img_count = sum(1 for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith('_temp_') and os.path.getsize(os.path.join(DATASET_DIR, folder.id, f)) > 0)
            vid_count = sum(1 for f in files if f.lower().endswith(('.mp4', '.webm', '.avi')) and not f.startswith('_temp_') and os.path.getsize(os.path.join(DATASET_DIR, folder.id, f)) > 0)
            if folder.image_count != img_count:
                folder.image_count = img_count
                dirty = True
            setattr(folder, "video_count", vid_count)
        else:
            setattr(folder, "video_count", 0)
    if dirty:
        db.commit()
        
    return folders

# --- ENDPOINT 2.2: STREAMING VIDEO WITH PROPER HTTP RANGE SUPPORT ---
@router.get("/video/{folder_id}/{filename}")
def stream_video(folder_id: str, filename: str, request: Request):
    """Serve video with HTTP 206 Range support for browser video players."""
    file_path = os.path.join(DATASET_DIR, folder_id, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video tidak ditemukan")

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise HTTPException(status_code=404, detail="File video kosong atau belum selesai direkam")

    # Determine correct media type
    ext = filename.lower().rsplit('.', 1)[-1]
    media_type_map = {'mp4': 'video/mp4', 'webm': 'video/webm', 'avi': 'video/x-msvideo'}
    media_type = media_type_map.get(ext, 'video/mp4')

    range_header = request.headers.get("Range")

    def iterfile(start: int, end: int):
        chunk_size = 1024 * 256  # 256 KB
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    if range_header:
        try:
            range_val = range_header.replace("bytes=", "")
            start_str, end_str = range_val.split("-")
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            start = 0
            end = file_size - 1

        end = min(end, file_size - 1)
        content_length = end - start + 1

        return StreamingResponse(
            iterfile(start, end),
            status_code=206,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )
    else:
        return StreamingResponse(
            iterfile(0, file_size - 1),
            status_code=200,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )


@router.get("/storage-info")
def get_storage_info():
    try:
        total, used, free = shutil.disk_usage(DATASET_DIR)
        used_percentage = round((used / total) * 100) if total > 0 else 0
        total_gb = round(total / (1024**3), 2)
        used_gb = round(used / (1024**3), 2)
        return {
            "total_gb": total_gb,
            "used_gb": used_gb,
            "used_percentage": used_percentage
        }
    except Exception:
        return {"total_gb": 50.0, "used_gb": 10.0, "used_percentage": 20}

# --- ENDPOINT 2.5: PERBARUI METADATA FOLDER ---
@router.put("/folders/{folder_id}", response_model=FolderResponse)
def update_folder(folder_id: str, payload: FolderUpdate, db: Session = Depends(get_db)):
    folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder dataset tidak ditemukan!")
    
    folder.name = payload.name
    folder.object_type = payload.object_type
    folder.operator = payload.operator
    db.commit()
    db.refresh(folder)
    return folder

# --- ENDPOINT 3: HAPUS FOLDER DATASET PERMANEN ---
@router.delete("/folders/{folder_id}")
def delete_dataset_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder dataset tidak ditemukan!")
    
    # Hapus direktori fisik
    shutil.rmtree(os.path.join(DATASET_DIR, folder_id), ignore_errors=True)
    
    db.delete(folder)
    db.commit()
    return {"message": "Folder dataset beserta metadata di dalamnya berhasil dihapus"}

# --- ENDPOINT 4: TAMBAH JUMLAH GAMBAR SECARA DINAMIS PASCA GRID SCAN ---
@router.put("/folders/{folder_id}/add-images")
def increment_image_count(folder_id: str, payload: ImageCountIncrement, db: Session = Depends(get_db)):
    folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder dataset tidak ditemukan!")
    
    folder.image_count += payload.count
    db.commit()
    db.refresh(folder)

    # Move files from static/uploads to static/datasets/{folder_id}
    folder_path = os.path.join(DATASET_DIR, folder_id)
    os.makedirs(folder_path, exist_ok=True)
    uploads_dir = os.path.join(DATASET_DIR, "..", "uploads")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    for filename in payload.filenames:
        src = os.path.join(uploads_dir, filename)
        
        base_name, ext = os.path.splitext(filename)
        new_filename = f"{base_name}_{timestamp}{ext}"
        
        dst = os.path.join(folder_path, new_filename)
        if os.path.exists(src):
            try:
                shutil.copy2(src, dst)
            except Exception as e:
                print(f"[ERROR] Gagal menyalin file {filename}: {e}")
    return {"message": "Jumlah gambar berhasil dimutasi", "current_image_count": folder.image_count}


@router.get("/folders/{folder_id}/images")
def get_folder_images(folder_id: str):
    folder_path = os.path.join(DATASET_DIR, folder_id)
    if not os.path.exists(folder_path):
        return []
    
    images = []
    files = os.listdir(folder_path)
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.mp4', '.webm')):
            # Skip temp files and 0-byte files
            if f.startswith('_temp_'):
                continue
            full_path = os.path.join(folder_path, f)
            if os.path.getsize(full_path) == 0:
                continue
            is_synced = f"{f}.synced" in files
            images.append({"name": f, "synced": is_synced})
            
    images.sort(key=lambda x: x["name"])
    return images

@router.post("/folders/{folder_id}/files")
def upload_files(folder_id: str, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder dataset tidak ditemukan!")
    
    folder_path = os.path.join(DATASET_DIR, folder_id)
    os.makedirs(folder_path, exist_ok=True)
    
    saved_count = 0
    for file in files:
        if file.filename:
            file_location = os.path.join(folder_path, file.filename)
            with open(file_location, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_count += 1
            
    folder.image_count += saved_count
    db.commit()
    db.refresh(folder)
    return {"message": f"{saved_count} file berhasil diunggah", "current_image_count": folder.image_count}

@router.get("/folders/{folder_id}/files/{filename}/download")
def download_single_file(folder_id: str, filename: str):
    file_path = os.path.join(DATASET_DIR, folder_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Gambar tidak ditemukan")
    return FileResponse(path=file_path, filename=filename)

@router.delete("/folders/{folder_id}/images")
def delete_images(folder_id: str, payload: DeleteImagesPayload, db: Session = Depends(get_db)):
    folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder dataset tidak ditemukan!")
    
    folder_path = os.path.join(DATASET_DIR, folder_id)
    deleted_count = 0
    
    for filename in payload.filenames:
        file_path = os.path.join(folder_path, filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            deleted_count += 1
            # Hapus juga file .synced jika ada
            synced_marker = file_path + ".synced"
            if os.path.exists(synced_marker):
                os.remove(synced_marker)
            
    # Pastikan count tidak kurang dari 0
    folder.image_count = max(0, folder.image_count - deleted_count)
    db.commit()
    db.refresh(folder)
    return {"message": f"{deleted_count} gambar berhasil dihapus", "current_image_count": folder.image_count}

@router.get("/folders/{folder_id}/download")
def download_folder_zip(folder_id: str, db: Session = Depends(get_db)):
    folder = db.query(models.DatasetFolder).filter(models.DatasetFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder dataset tidak ditemukan!")
        
    folder_path = os.path.join(DATASET_DIR, folder_id)
    if not os.path.exists(folder_path) or not os.listdir(folder_path):
        raise HTTPException(status_code=400, detail="Folder dataset kosong, tidak ada yang bisa diunduh.")
        
    zip_filename = f"{folder.name}.zip"
    zip_filepath = os.path.join(DATASET_DIR, f"{folder_id}_{zip_filename}")
    
    # Buat file zip sementara
    with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                # Jangan sertakan file penanda sync (.synced) ke dalam zip
                if not file.endswith('.synced'):
                    zipf.write(os.path.join(root, file), file)
                
    return FileResponse(path=zip_filepath, filename=zip_filename, media_type='application/zip')

# --- MOCK VPS ENDPOINT UNTUK PENGUJIAN HYBRID SYNCING ---
@router.post("/vps-mock/sync")
def mock_vps_sync(files: List[UploadFile] = File(...)):
    # Digantikan oleh endpoint per folder /folders/{folder_id}/files
    return {"message": f"Mock VPS berhasil menerima {len(files)} file dan menyimpannya ke Cloud.", "status": "success"}

# --- ENDPOINT INDEX SINKRONISASI DUA ARAH (DOWNSTREAM MIRRORING) ---
@router.get("/vps/sync-index")
def get_vps_sync_index(db: Session = Depends(get_db)):
    folders = db.query(models.DatasetFolder).all()
    index = {}
    for folder in folders:
        folder_path = os.path.join(DATASET_DIR, folder.id)
        files = []
        if os.path.exists(folder_path):
            files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.mp4', '.webm'))]
        index[folder.id] = {
            "name": folder.name,
            "object_type": folder.object_type,
            "operator": folder.operator,
            "date": folder.date,
            "files": files
        }
    return {"folders": index}

# --- ENDPOINT 13: EXPORT ALL STORAGE ---
@router.get("/storage/export")
def export_all_dataset():
    zip_filename = "all_datasets_export.zip"
    zip_path = os.path.join(DATASET_DIR, zip_filename)
    
    # Create zip containing all folders
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(DATASET_DIR):
            for file in files:
                if file != zip_filename:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, DATASET_DIR)
                    zipf.write(file_path, arcname)
                    
    return FileResponse(path=zip_path, filename=zip_filename, media_type="application/zip")

# --- ENDPOINT 14: PURGE TEMPORARY CACHE ---
import json
import redis.asyncio as redis

@router.delete("/storage/purge-cache")
async def purge_temporary_cache():
    cleared_bytes = 0
    
    # 1. Bersihkan file _temp_ di DATASET_DIR
    for root, dirs, files in os.walk(DATASET_DIR):
        for file in files:
            if file.startswith("_temp_"):
                file_path = os.path.join(root, file)
                cleared_bytes += os.path.getsize(file_path)
                os.remove(file_path)
                
    # 2. Bersihkan seluruh file gambar di UPLOAD_DIR
    UPLOAD_DIR = "./static/uploads"
    if os.path.exists(UPLOAD_DIR):
        for file in os.listdir(UPLOAD_DIR):
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                file_path = os.path.join(UPLOAD_DIR, file)
                cleared_bytes += os.path.getsize(file_path)
                os.remove(file_path)
                
    # 3. Kirim perintah PURGE_CACHE ke Edge Device via Redis
    try:
        from ..redis_mock import get_redis_client
        redis_client = await get_redis_client(os.getenv("REDIS_URL", "redis://redis:6379/0"))
        await redis_client.publish("hardware_commands", json.dumps({"action": "PURGE_CACHE"}))
        # Do not close the shared redis client if it's mock
    except Exception as e:
        print("Failed to publish PURGE_CACHE:", e)
        
    return {"message": f"Cache purged. {cleared_bytes} bytes freed."}