from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from pydantic import BaseModel
# from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import bcrypt
from ..database import get_db
from .. import models

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

# Konfigurasi Enkripsi Password (Bcrypt)
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Konfigurasi Token JWT (Gunakan SECRET_KEY kustom untuk keamanan lab)
SECRET_KEY = "UNDIP_BRIN_MICROSCOPY_SECRET_KEY_SUPER_SECURE"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120 # Token aktif selama 2 jam

# Schema Pydantic untuk Validasi Input Payload dari React Frontend
class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenData(BaseModel):
    username: str
    role: str

# --- FUNGSI UTILITAS ENKRIPSI ---
def hash_password(password: str) -> str:
    # Mengubah string password menjadi bytes sebelum di-hash
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- ENDPOINT 1: REGISTRASI OPERATOR BARU ---
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user_data: UserRegister, db: Session = Depends(get_db)):
    # Cek apakah username sudah terdaftar di PostgreSQL
    existing_user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username/ID Operator sudah terdaftar!")

    # Set RBAC otomatis: jika ketik 'Admin' jadi ADMIN, sisanya jadi OPERATOR
    role_assignment = "ADMIN" if user_data.username.upper() == "ADMIN" else "OPERATOR"
    
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

    # Bungkus informasi penting (username & role) ke dalam token akses
    token_payload = {"sub": user.username, "role": user.role}
    access_token = create_access_token(data=token_payload)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }