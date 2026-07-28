import uuid
import os
import shutil
import zipfile
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from ..database import get_db
from .. import models

# Skema Pydantic baru untuk payload penambahan gambar
class ImageCountIncrement(BaseModel):
    count: int

DATASET_DIR = "./static/datasets"
os.makedirs(DATASET_DIR, exist_ok=True)

router = APIRouter(
    prefix="/api/dataset",
    tags=["Dataset Management"]
)

# Schema Pydantic untuk validasi data dari Frontend
class FolderCreate(BaseModel):
    name: str
    object_type: str
    date: str
    operator: str

class FolderUpdate(BaseModel):
    name: str
    object_type: str
    operator: str

class FolderResponse(BaseModel):
    id: str
    name: str
    object_type: str
    date: str
    operator: str
    image_count: int

    class Config:
        from_attributes = True

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
            img_count = sum(1 for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg')))
            if folder.image_count != img_count:
                folder.image_count = img_count
                dirty = True
    if dirty:
        db.commit()
        
    return folders

# --- ENDPOINT 2.1: DATA KAPASITAS HARD DISK SERVER HOSTING ---
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
    return {"message": "Jumlah gambar berhasil dimutasi", "current_image_count": folder.image_count}

class DeleteImagesPayload(BaseModel):
    filenames: List[str]

@router.get("/folders/{folder_id}/images")
def get_folder_images(folder_id: str):
    folder_path = os.path.join(DATASET_DIR, folder_id)
    if not os.path.exists(folder_path):
        return []
    
    images = []
    files = os.listdir(folder_path)
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg')):
            is_synced = f"{f}.synced" in files
            images.append({"name": f, "synced": is_synced})
            
    images.sort(key=lambda x: x["name"])
    return images

@router.post("/folders/{folder_id}/images")
def upload_images(folder_id: str, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
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
    return {"message": f"{saved_count} gambar berhasil diunggah", "current_image_count": folder.image_count}

@router.get("/folders/{folder_id}/images/{filename}/download")
def download_single_image(folder_id: str, filename: str):
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
    # Dalam dunia nyata, VPS akan menyimpan file ini ke storage S3 atau direktori lokalnya
    return {"message": f"Mock VPS berhasil menerima {len(files)} file dan menyimpannya ke Cloud.", "status": "success"}

# --- ENDPOINT INDEX SINKRONISASI DUA ARAH (DOWNSTREAM MIRRORING) ---
@router.get("/vps/sync-index")
def get_vps_sync_index(db: Session = Depends(get_db)):
    folders = db.query(models.DatasetFolder).all()
    index = {}
    for folder in folders:
        folder_path = os.path.join(DATASET_DIR, folder.id)
        images = []
        if os.path.exists(folder_path):
            images = [f for f in os.listdir(folder_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        index[folder.id] = {
            "name": folder.name,
            "object_type": folder.object_type,
            "operator": folder.operator,
            "date": folder.date,
            "images": images
        }
    return {"folders": index}