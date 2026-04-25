from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.models.schemas import HealthResponse
from app.routers.chat import router as chat_router
from app.routers.suggestions import router as suggestions_router
from app.routers.transcribe import router as transcribe_router


load_dotenv()


frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
allowed_origins = [frontend_url] if frontend_url else []


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="TwinMind Backend",
    description="Live transcription, suggestions, and chat API for TwinMind assignment",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse()


app.include_router(transcribe_router, prefix="/api")
app.include_router(suggestions_router, prefix="/api")
app.include_router(chat_router, prefix="/api")

if __name__=="__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
