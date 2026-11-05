#!/usr/bin/env python3
"""Buat atau promosikan akun admin secara manual (registrasi publik selalu OPERATOR).

Pemakaian:
    docker exec -it mikroskop_backend python create_admin.py <username>
Password diminta interaktif, atau lewat env ADMIN_PASSWORD untuk otomatisasi.
"""
import getpass
import os
import sys

from app import models
from app.database import SessionLocal, engine
from app.services.auth_service import hash_password


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    username = sys.argv[1]
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password admin: ")
    if len(password) < 8:
        print("Password minimal 8 karakter.")
        return 2

    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(username=username).first()
        if user is None:
            db.add(models.User(username=username, hashed_password=hash_password(password), role="ADMIN"))
            action = "dibuat"
        else:
            user.hashed_password = hash_password(password)
            user.role = "ADMIN"
            action = "diperbarui"
        db.commit()
    finally:
        db.close()
    print(f"Admin '{username}' {action}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
