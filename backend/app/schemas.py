from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# ==========================================
# HARDWARE & CNC SCHEMAS (hardware.py)
# ==========================================
class MotorMovePayload(BaseModel):
    axis: str
    value: float
    feed_rate: float
    unit: str

class CameraSettingsPayload(BaseModel):
    shutter_speed: int
    iso: int

class HardwareBusTogglePayload(BaseModel):
    enabled: bool

class CncSettingsPayload(BaseModel):
    feed_rate: float
    backlash: float
    acceleration: float
    settle_time: int

class GridScanPayload(BaseModel):
    columns: int
    rows: int
    step_x: float
    step_y: float
    delay_ms: int
    unit: str
    start_x: float
    start_y: float

class StitchPayload(BaseModel):
    images: List[str] = []
    # Info tiap tile. Item bisa berisi:
    #   {"filename": str, "coordX": float, "coordY": float, "gridX": int, "gridY": int}
    tiles: Optional[List[Dict[str, Any]]] = None
    # Pilihan model/backend stitching: sp_lg_tensorrt | sp_lg_pytorch | sp_lg_onnx
    model: Optional[str] = "sp_lg_tensorrt"

class InputTileFromDataset(BaseModel):
    folder_id: str
    image_name: str
    grid_x: int
    grid_y: int

class RetakePayload(BaseModel):
    coord_x: float
    coord_y: float
    filename: str
    delay_ms: int

class AiConfigPayload(BaseModel):
    model: str
    confThreshold: int

class NetworkConfigPayload(BaseModel):
    ipBinding: str
    apiPort: str

class AdminRoomActionPayload(BaseModel):
    cid: str
    action: str


# ==========================================
# AUTH SCHEMAS (auth.py)
# ==========================================
class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenData(BaseModel):
    username: str
    role: str

class RoleUpdate(BaseModel):
    role: str

class PasswordChange(BaseModel):
    username: str
    old_password: str
    new_password: str

# ==========================================
# DATASET SCHEMAS (dataset.py)
# ==========================================
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
    video_count: int = 0

    class Config:
        from_attributes = True

class ImageCountIncrement(BaseModel):
    count: int
    filenames: List[str] = []

class DeleteImagesPayload(BaseModel):
    filenames: List[str]

# ==========================================
# ANALYSIS SCHEMAS (analysis.py)
# ==========================================
class ToolPayload(BaseModel):
    filename: str
    current_src: str
    params: Optional[Dict[str, Any]] = {}

# ==========================================
# DOCUMENTATION SCHEMAS (documentation.py)
# ==========================================
class ReportPayload(BaseModel):
    folder_id: str
    title: str = "Laporan Hasil Analisis Mikroskop"
    folder_name: str = ""
    object_type: str = ""
    operator: str = ""
    date: str = ""

# ==========================================
# LOGS SCHEMAS (logs.py)
# ==========================================
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
