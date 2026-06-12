import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from ..database import get_db
from .. import models

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
    
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

# --- ENDPOINT 2: AMBIL SEMUA DAFTAR FOLDER DATASET ---
@router.get("/folders", response_model=List[FolderResponse])
def get_all_folders(db: Session = Depends(get_db)):
    folders = db.query(models.DatasetFolder).all()
    return folders