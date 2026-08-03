from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from pydantic import BaseModel
from datetime import datetime
from ..database import get_db
from .. import models

router = APIRouter(prefix="/api/logs", tags=["logs"])

class LogCreate(BaseModel):
    operator: str
    action: str
    status: str = "SUCCESS"

class LogResponse(BaseModel):
    id: int
    timestamp: str
    operator: str
    action: str
    status: str

    class Config:
        orm_mode = True
        from_attributes = True

@router.get("", response_model=List[LogResponse])
def get_logs(limit: int = 100, db: Session = Depends(get_db)):
    """Mengambil riwayat log terbaru (maks 100)."""
    logs = db.query(models.SystemLog).order_by(desc(models.SystemLog.timestamp), desc(models.SystemLog.id)).limit(limit).all()
    return logs

@router.post("", response_model=LogResponse)
def create_log(payload: LogCreate, db: Session = Depends(get_db)):
    """Menyimpan log baru ke dalam sistem."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    db_log = models.SystemLog(
        timestamp=now_str,
        operator=payload.operator,
        action=payload.action,
        status=payload.status
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

@router.delete("", status_code=200)
def clear_logs(db: Session = Depends(get_db)):
    """Menghapus seluruh riwayat log dari sistem (hanya Admin)."""
    deleted_count = db.query(models.SystemLog).delete()
    db.commit()
    return {"message": f"{deleted_count} log berhasil dihapus."}
