# app/storage/minio.py

from collections.abc import Iterable
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.settings import get_settings

DELETE_BATCH_SIZE = 1000


@lru_cache
def get_s3_client():
    settings = get_settings()

    return boto3.client(
        "s3",
        endpoint_url=settings.minio_endpoint,
        aws_access_key_id=settings.minio_access_key.get_secret_value(),
        aws_secret_access_key=settings.minio_secret_key.get_secret_value(),
        region_name=settings.s3_region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=3,
            read_timeout=10,
            retries={"max_attempts": 2},
        ),
    )


def ensure_bucket_exists() -> None:
    """Create the configured bucket if it does not already exist."""
    client = get_s3_client()
    bucket = get_settings().minio_bucket

    try:
        client.head_bucket(Bucket=bucket)
        return
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get(
            "HTTPStatusCode"
        )

        if status != 404:
            raise

    client.create_bucket(Bucket=bucket)


def upload_record(*, object_key: str, body: bytes) -> None:
    """Store a record only if its object key does not already exist."""
    client = get_s3_client()
    bucket = get_settings().minio_bucket

    try:
        client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=body,
            ContentType="application/octet-stream",
            IfNoneMatch="*",
        )
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get(
            "HTTPStatusCode"
        )
        code = exc.response.get("Error", {}).get("Code", "")

        if status == 412 or code in {"PreconditionFailed", "412"}:
            raise FileExistsError(object_key) from exc

        raise


def download_record(*, object_key: str) -> bytes:
    """Retrieve a stored encrypted record."""
    response = get_s3_client().get_object(
        Bucket=get_settings().minio_bucket,
        Key=object_key,
    )

    try:
        return response["Body"].read()
    finally:
        response["Body"].close()


def delete_record(*, object_key: str) -> None:
    """Delete a stored record; deleting a missing key is harmless."""
    get_s3_client().delete_object(
        Bucket=get_settings().minio_bucket,
        Key=object_key,
    )


def delete_objects(*, keys: Iterable[str]) -> int:
    """Delete keys in S3-compatible batches; return the count reported deleted.

    Raises if S3 reports any per-object deletion errors. Missing keys are
    normally reported as successfully deleted by S3-compatible providers.
    """
    client = get_s3_client()
    bucket = get_settings().minio_bucket
    deleted_count = 0
    batch: list[str] = []

    def flush_batch(batch_keys: list[str]) -> int:
        if not batch_keys:
            return 0

        response = client.delete_objects(
            Bucket=bucket,
            Delete={
                "Objects": [{"Key": key} for key in batch_keys],
                "Quiet": False,
            },
        )

        errors = response.get("Errors", [])
        if errors:
            # Do not include object keys in the exception or application logs.
            raise RuntimeError(
                f"S3 object deletion failed for {len(errors)} object(s)"
            )

        return len(response.get("Deleted", []))

    for key in keys:
        if not key:
            raise ValueError("Object keys must not be empty")

        batch.append(key)

        if len(batch) == DELETE_BATCH_SIZE:
            deleted_count += flush_batch(batch)
            batch = []

    deleted_count += flush_batch(batch)
    return deleted_count


def delete_prefix(*, prefix: str) -> int:
    """Delete every object under a prefix using paginated listing."""
    if not prefix:
        raise ValueError("Prefix must not be empty")

    client = get_s3_client()
    bucket = get_settings().minio_bucket
    paginator = client.get_paginator("list_objects_v2")
    deleted_count = 0

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        keys = [
            item["Key"]
            for item in page.get("Contents", [])
            if item.get("Key")
        ]

        if keys:
            deleted_count += delete_objects(keys=keys)

    return deleted_count