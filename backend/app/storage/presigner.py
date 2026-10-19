
# app/storage/presigner.py

import re
from functools import lru_cache
from urllib.parse import urlsplit

import boto3
from botocore.config import Config

from app.core.settings import get_settings

_DROP_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def build_record_object_key(drop_id: str, index: int) -> str:
    """Build the canonical storage key for a record."""
    if not _DROP_ID_PATTERN.fullmatch(drop_id):
        raise ValueError("Invalid drop ID")

    if not 0 <= index <= 1_048_576:
        raise ValueError("Invalid record index")

    return f"drops/{drop_id}/{index:07d}"


@lru_cache(maxsize=1)
def _get_presigning_client():
    settings = get_settings()

    # Sign against the public endpoint: the host is part of the signature.
    endpoint = settings.s3_public_endpoint_url
    parsed_endpoint = urlsplit(endpoint)

    if parsed_endpoint.scheme not in {"http", "https"}:
        raise ValueError("S3_PUBLIC_ENDPOINT_URL must use HTTP or HTTPS")

    if not parsed_endpoint.netloc:
        raise ValueError("S3_PUBLIC_ENDPOINT_URL must include a hostname")

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.s3_region,
        aws_access_key_id=settings.minio_access_key.get_secret_value(),
        aws_secret_access_key=settings.minio_secret_key.get_secret_value(),
        config=Config(
            signature_version="s3v4",
            # Keep custom-endpoint URLs predictable for MinIO and R2.
            s3={"addressing_style": "path"},
        ),
    )


def presign_record_get_url(object_key: str) -> str:
    """Create a short-lived URL that permits GET access to one record."""
    settings = get_settings()

    # Never lengthen the URL lifetime beyond the configured limit.
    return _get_presigning_client().generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": settings.minio_bucket,
            "Key": object_key,
        },
        ExpiresIn=settings.presigned_url_ttl_seconds,
        HttpMethod="GET",
    )
