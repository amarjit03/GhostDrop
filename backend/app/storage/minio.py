from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.settings import get_settings


@lru_cache
def get_s3_client():
    settings = get_settings()

    return boto3.client(
        "s3",
        endpoint_url=settings.minio_endpoint,
        aws_access_key_id=settings.minio_access_key.get_secret_value(),
        aws_secret_access_key=settings.minio_secret_key.get_secret_value(),
        region_name="us-east-1",
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
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")

        # Create only when the bucket is confirmed missing.
        if status != 404:
            raise

    # The endpoint is configured for local MinIO.
    client.create_bucket(Bucket=bucket)


def upload_record(
    *,
    object_key: str,
    body: bytes,
) -> None:
    """Store a record only if its object key does not already exist."""
    client = get_s3_client()
    bucket = get_settings().minio_bucket

    try:
        # Conditional creation prevents overwriting an existing object.
        client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=body,
            ContentType="application/octet-stream",
            IfNoneMatch="*",
        )
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
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
    """Delete a stored record when application cleanup requires it."""
    get_s3_client().delete_object(
        Bucket=get_settings().minio_bucket,
        Key=object_key,
    )
