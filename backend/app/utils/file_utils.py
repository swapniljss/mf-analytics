import hashlib
import os
import uuid
from pathlib import Path
from app.config import settings


def compute_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def save_upload(file_bytes: bytes, original_filename: str) -> str:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(original_filename).suffix
    unique_name = f"{uuid.uuid4()}{ext}"
    dest = upload_dir / unique_name
    dest.write_bytes(file_bytes)
    return str(dest)


def get_file_size(file_path: str) -> int:
    return os.path.getsize(file_path)
