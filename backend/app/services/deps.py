import hmac
import os
from typing import Optional

from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .auth_service import ALGORITHM, SECRET_KEY

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
_optional_bearer = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token tidak valid atau sudah kedaluwarsa",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _user_from_token(token: str, db: Session) -> models.User:
    try:
        username = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]).get("sub")
    except JWTError:
        raise _unauthorized()
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise _unauthorized()
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    return _user_from_token(token, db)


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if (user.role or "").upper() != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hanya untuk Admin")
    return user


def edge_token_required() -> bool:
    """Saat transisi, EDGE_TOKEN_REQUIRED=false membiarkan Jetson lama tetap tersambung."""
    return os.getenv("EDGE_TOKEN_REQUIRED", "true").strip().lower() not in ("false", "0", "no")


def edge_token_valid(token: Optional[str]) -> bool:
    expected = os.getenv("EDGE_DEVICE_TOKEN", "")
    if not expected or not token:
        return False
    return hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))


def get_media_user(
    query_token: Optional[str] = Query(None, alias="token"),
    bearer: Optional[str] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    """Untuk URL yang dibuka browser langsung (<video src>, <a href>), yang tidak
    bisa membawa header Authorization: token boleh lewat query string."""
    token = bearer or query_token
    if not token:
        raise _unauthorized()
    return _user_from_token(token, db)


def get_user_or_edge(
    x_edge_token: Optional[str] = Header(None),
    query_token: Optional[str] = Query(None, alias="token"),
    bearer: Optional[str] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
):
    """Endpoint yang dipakai browser sekaligus vps_syncer di Jetson."""
    if edge_token_valid(x_edge_token):
        return "EDGE"
    token = bearer or query_token
    if token:
        return _user_from_token(token, db)
    if not edge_token_required():
        return "EDGE"
    raise _unauthorized()
