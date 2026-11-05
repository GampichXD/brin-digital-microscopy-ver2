"""M10-M12 (A13): nama file/folder tidak boleh keluar dari folder tujuan."""
import io
import os
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.services.safe_path import safe_join, safe_name
from helpers import auth, token_for

import pytest
from fastapi import HTTPException

client = TestClient(app)
client.headers.update(auth(token_for("uji_admin", "ADMIN")))


def _folder():
    res = client.post("/api/dataset/folders", json={
        "name": f"traversal_{uuid.uuid4().hex[:8]}", "object_type": "uji",
        "date": "2026-11-05", "operator": "uji",
    })
    assert res.status_code == 201
    return res.json()["id"]


def test_M10_upload_nama_traversal_ditolak():
    fid = _folder()
    marker = f"pwned_{uuid.uuid4().hex[:8]}.txt"
    res = client.post(f"/api/dataset/folders/{fid}/files",
                      files={"files": (f"../../{marker}", io.BytesIO(b"x"), "text/plain")})
    assert res.status_code == 400
    assert not os.path.exists(os.path.join("static", marker))
    assert not os.path.exists(os.path.join("static", "datasets", fid, marker))
    client.delete(f"/api/dataset/folders/{fid}")


def test_M11_delete_nama_traversal_ditolak(tmp_path):
    fid = _folder()
    victim = os.path.join("static", "datasets", f"korban_{uuid.uuid4().hex[:8]}.txt")
    open(victim, "w").close()
    try:
        res = client.request("DELETE", f"/api/dataset/folders/{fid}/images",
                             json={"filenames": ["../" + os.path.basename(victim)]})
        assert res.status_code == 400
        assert os.path.exists(victim)
    finally:
        os.remove(victim)
        client.delete(f"/api/dataset/folders/{fid}")


def test_M12_video_traversal_ditolak():
    assert client.get("/api/dataset/video/%2e%2e/%2e%2e%2fapp%2fmain.py").status_code in (400, 404)
    assert client.get("/api/dataset/folders/x/files/..%2f..%2fmain.py/download").status_code in (400, 404)


def test_M12b_stitch_dan_analisis_menolak_traversal():
    assert client.post("/api/analysis/sobel", json={
        "filename": "../../app/main.py", "current_src": "", "params": {}}).status_code == 400
    assert client.post("/api/analysis/sobel", json={
        "filename": f"tidak_ada_{uuid.uuid4().hex[:6]}.jpg",
        "current_src": "/static/datasets/../../app/main.py", "params": {}}).status_code == 400
    assert client.post("/api/hardware/stitch", json={
        "tiles": [{"filename": "../../x.jpg"}]}).status_code == 400


@pytest.mark.parametrize("name", ["result_brute_force(1).jpg", "foto saya (2).jpg", "IMG_0001.jpg", ".hidden.jpg"])
def test_nama_dataset_lama_tetap_diterima(name):
    assert safe_name(name) == name


@pytest.mark.parametrize("name", ["", ".", "..", "a/b", "../x", "..\\x", "a\x00b", "a\nb", "x" * 256])
def test_nama_berbahaya_ditolak(name):
    with pytest.raises(HTTPException) as err:
        safe_name(name)
    assert err.value.status_code == 400


def test_safe_join_menolak_symlink_keluar(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    (root / "tautan").symlink_to(tmp_path)
    with pytest.raises(HTTPException):
        safe_join(str(root), "tautan")
    assert safe_join(str(root), "biasa.jpg") == os.path.join(os.path.realpath(str(root)), "biasa.jpg")
