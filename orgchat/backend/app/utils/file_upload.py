import os
import uuid
from typing import Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile

from app.config import settings

UPLOAD_DIR = "uploads"

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "video/mp4",
    "audio/mpeg",
    "audio/mp4",
}

# Magic-byte signatures: (prefix_bytes, expected_mime_or_None_for_multi)
_MAGIC: list[tuple[bytes, str | None]] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", None),              # could be WebP (checked separately)
    (b"%PDF", "application/pdf"),
    (b"PK\x03\x04", None),        # ZIP / DOCX / XLSX
    (b"ID3", "audio/mpeg"),
    (b"\xff\xfb", "audio/mpeg"),
    (b"\xff\xf3", "audio/mpeg"),
    (b"\xff\xf2", "audio/mpeg"),
]

_MULTI_TYPE_ALLOW = {
    # RIFF containers
    "image/webp",
    "audio/mp4",
    # ZIP-based
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    # MP4 magic starts with 0x00 0x00 0x00 and varies
    "video/mp4",
}


def _detect_mime(header: bytes, declared: str) -> bool:
    """Return True if the file header is consistent with the declared MIME type."""
    for magic, expected in _MAGIC:
        if header.startswith(magic):
            if expected is None:
                # Ambiguous prefix — accept only types we whitelist for these
                return declared in _MULTI_TYPE_ALLOW
            return expected == declared

    # MP4 / MOV: ftyp box at offset 4
    if len(header) >= 8 and header[4:8] in (b"ftyp", b"moov"):
        return declared in ("video/mp4", "audio/mp4")

    # Unknown signature — reject unknown types, accept whitelisted ones
    return declared in _MULTI_TYPE_ALLOW


def _safe_filename(original: str | None) -> str:
    ext = ""
    if original:
        _, ext = os.path.splitext(original)
    return f"{uuid.uuid4().hex}{ext}"


async def validate_and_upload(file: UploadFile) -> Tuple[str, str, int, str]:
    """
    Validate MIME type via magic bytes and size, then upload.
    Returns (file_url, file_name, file_size, mime_type).
    """
    declared_type: str = (file.content_type or "").split(";")[0].strip()

    if declared_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed: {declared_type}",
        )

    content = await file.read()
    file_size = len(content)
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    if file_size > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB} MB",
        )

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    header = content[:16]
    if not _detect_mime(header, declared_type):
        raise HTTPException(
            status_code=400,
            detail="File content does not match its declared MIME type",
        )

    safe_name = _safe_filename(file.filename)
    original_name = file.filename or safe_name

    if settings.s3_configured:
        file_url = await _upload_to_s3(content, safe_name, declared_type)
    else:
        file_url = _save_locally(content, safe_name)

    return file_url, original_name, file_size, declared_type


async def _upload_to_s3(content: bytes, key: str, content_type: str) -> str:
    try:
        client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        client.put_object(
            Bucket=settings.S3_BUCKET,
            Key=f"uploads/{key}",
            Body=content,
            ContentType=content_type,
        )
        return (
            f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}"
            f".amazonaws.com/uploads/{key}"
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {exc}")


def _save_locally(content: bytes, filename: str) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as fh:
        fh.write(content)
    return f"/uploads/{filename}"
