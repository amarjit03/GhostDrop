
# app/main.py

import logging
from contextlib import asynccontextmanager
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.v1.drops import router as drops_router
from app.workers.scheduler import start_cleanup_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler = start_cleanup_scheduler()

    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
            logger.info("Cleanup scheduler stopped")


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def normalize_metadata_not_found(
    request: Request,
    call_next,
):
    raw_path = request.scope.get("raw_path", b"").decode(
        "ascii", errors="ignore"
    )
    decoded_path = unquote(raw_path)

    # Handle encoded slashes in drop metadata URLs.
    is_metadata_path = (
        "/v1/drops/" in decoded_path
        and decoded_path.endswith("/meta")
        and "%2f" in raw_path.lower()
    )

    response = await call_next(request)

    if is_metadata_path and response.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={"detail": {"code": "drop_not_found"}},
            headers={"Cache-Control": "no-store"},
        )

    return response


origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the drop creation, envelope, and record endpoints.
app.include_router(drops_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
