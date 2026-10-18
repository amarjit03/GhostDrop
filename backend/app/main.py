from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.drops import router as drops_router

app = FastAPI()

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

app.include_router(drops_router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
