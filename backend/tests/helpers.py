"""Pembantu bersama untuk tes: buat akun langsung di DB, terbitkan token."""
from app import models
from app.database import SessionLocal
from app.services.auth_service import create_access_token, hash_password

PASSWORD = "PasswordUji123!"


def ensure_user(username: str, role: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(username=username).first()
        if user is None:
            db.add(models.User(username=username, hashed_password=hash_password(PASSWORD), role=role))
        else:
            user.role = role
        db.commit()
    finally:
        db.close()


def token_for(username: str, role: str) -> str:
    ensure_user(username, role)
    return create_access_token({"sub": username, "role": role})


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
