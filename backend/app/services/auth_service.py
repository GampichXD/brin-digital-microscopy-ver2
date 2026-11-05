import os
from typing import Optional
from datetime import datetime, timedelta
from jose import jwt
import bcrypt

# SECRET_KEY wajib dari environment. Tanpa nilai ini server menolak start, kecuali
# ENV=test, supaya rahasia tidak pernah kembali tertulis di kode sumber.
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    if os.environ.get("ENV") == "test":
        SECRET_KEY = "dummy-key-khusus-pengujian"
    else:
        raise RuntimeError(
            "JWT_SECRET_KEY belum diisi. Buat dengan: "
            "python -c \"import secrets;print(secrets.token_urlsafe(48))\""
        )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720 # Token aktif selama 12 jam (instrumen lab, sesi panjang)

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
