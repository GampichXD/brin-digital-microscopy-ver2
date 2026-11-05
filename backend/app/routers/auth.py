from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..schemas import UserRegister, UserLogin, RoleUpdate, PasswordChange
from ..services.auth_service import hash_password, verify_password, create_access_token
from ..services import presence
from ..services.deps import get_current_user, require_admin


def _set_setting(db: Session, key: str, value: str):
    row = db.query(models.SystemSetting).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(models.SystemSetting(key=key, value=value))
    db.commit()

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

# --- ENDPOINT 1: REGISTRASI OPERATOR BARU ---
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user_data: UserRegister, db: Session = Depends(get_db)):
    # Cek apakah username sudah terdaftar di PostgreSQL
    existing_user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username/ID Operator sudah terdaftar!")

    # Semua akun baru berperan OPERATOR. Admin dibuat lewat backend/create_admin.py.
    role_assignment = "OPERATOR"
    
    # Lakukan hashing password sebelum disimpan demi standardisasi keamanan
    hashed_pwd = hash_password(user_data.password)
    
    new_user = models.User(
        username=user_data.username,
        hashed_password=hashed_pwd,
        role=role_assignment
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": f"Registrasi sukses sebagai {role_assignment}", "username": new_user.username}

# --- ENDPOINT 2: LOGIN UTAMA (VERIFIKASI & TERBITKAN JWT) ---
@router.post("/login")
def login_user(credentials: UserLogin, db: Session = Depends(get_db)):
    # Cari user di database
    user = db.query(models.User).filter(models.User.username == credentials.username).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="ID Operator atau Password salah!")

    # Catat waktu login terakhir (in-memory + persist ke SystemSetting).
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    presence.record_login(user.username, now_str)
    try:
        _set_setting(db, f"lastlogin:{user.username}", now_str)
    except Exception:
        pass

    # Bungkus informasi penting (username & role) ke dalam token akses
    token_payload = {"sub": user.username, "role": user.role}
    access_token = create_access_token(data=token_payload)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

# --- ENDPOINT 3: AMBIL SEMUA OPERATOR LAB (KHUSUS CONTROL PANEL ADMIN) ---
@router.get("/operators", dependencies=[Depends(require_admin)])
def get_all_operators(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    settings = {s.key: s.value for s in db.query(models.SystemSetting).all()}
    result = []
    for u in users:
        last = presence.get_last_login(u.username) or settings.get(f"lastlogin:{u.username}", "")
        result.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            # ONLINE = ada koneksi WebSocket klien aktif untuk user ini.
            "status": "ONLINE" if presence.is_online(u.username) else "OFFLINE",
            "online": presence.is_online(u.username),
            "last_login": last or "—",
        })
    return result

# --- ENDPOINT 4: UBAH TINGKAT HAK AKSES OPERATOR (RBAC MUTASI) ---
@router.put("/operators/{user_id}/role", dependencies=[Depends(require_admin)])
def update_operator_role(user_id: int, role_data: RoleUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Operator tidak ditemukan!")
    
    user.role = role_data.role.upper()
    db.commit()
    return {"message": f"Otoritas {user.username} berhasil diubah menjadi {user.role}"}

# --- ENDPOINT 5: HAPUS OPERATOR LAB ---
@router.delete("/operators/{user_id}", dependencies=[Depends(require_admin)])
def delete_operator(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Operator tidak ditemukan!")
    
    db.delete(user)
    db.commit()
    return {"message": "Akun operator berhasil dihapus dari sistem"}

# --- ENDPOINT 6: RESET PASSWORD KE DEFAULT (ADMIN ONLY) ---
@router.put("/reset-password", dependencies=[Depends(require_admin)])
def reset_password(payload: dict, db: Session = Depends(get_db)):
    user_id = payload.get("user_id")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Operator tidak ditemukan!")
    
    # Reset ke default 123456
    user.hashed_password = hash_password("123456")
    db.commit()
    return {"message": f"Password {user.username} berhasil di-reset ke 123456"}

# --- ENDPOINT 7: GANTI PASSWORD OLEH USER (MANDIRI) ---
@router.put("/profile/password")
def change_password(payload: PasswordChange, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Username diambil dari token, bukan dari body.
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Password lama salah!")
        
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password berhasil diperbarui"}