"""Lingkungan uji terisolasi: DB SQLite sementara dan folder kerja sementara.

Harus dijalankan SEBELUM `app` di-import, karena modul app membaca env dan
membuat folder `static/` relatif terhadap folder kerja saat di-import. Dengan
begitu tes tidak pernah menyentuh microscopy.db maupun static/ milik pengembang.
"""
import os
import tempfile

_workdir = tempfile.mkdtemp(prefix="microscopy_test_")
os.environ["ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{_workdir}/test.db"
os.environ["JWT_SECRET_KEY"] = "kunci-khusus-pengujian-bukan-untuk-produksi-0123456789"
os.environ["EDGE_DEVICE_TOKEN"] = "token-edge-pengujian"

import pytest  # noqa: E402


def pytest_sessionstart(session):
    # Pindah folder di sini, bukan saat conftest di-import: pytest masih perlu
    # folder asal untuk menemukan testpaths.
    os.chdir(_workdir)
    os.makedirs("static/datasets", exist_ok=True)
    os.makedirs("static/uploads", exist_ok=True)

    from app import models
    from app.database import engine

    models.Base.metadata.create_all(bind=engine)


def pytest_collection_modifyitems(items):
    for item in items:
        for marker in ("unit", "integration", "security"):
            if f"/tests/{marker}/" in str(item.path).replace(os.sep, "/"):
                item.add_marker(marker)


@pytest.fixture
def admin_token():
    from helpers import token_for
    return token_for("uji_admin", "ADMIN")


@pytest.fixture
def operator_token():
    from helpers import token_for
    return token_for("uji_operator", "OPERATOR")
