from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import HTTPException, status
from groq import Groq

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
TRANSCRIBE_MODEL = "whisper-large-v3-turbo"
TEXT_MODEL = "openai/gpt-oss-20b"


def resolve_api_key(request_api_key: Optional[str]) -> str:
    key = (request_api_key or "").strip() or os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Groq API key. Provide api_key in request or set GROQ_API_KEY.",
        )
    return key


def get_groq_client(request_api_key: Optional[str]) -> Groq:
    return Groq(api_key=resolve_api_key(request_api_key))


async def transcribe_audio(
    audio_bytes: bytes,
    api_key: str,
    filename: str = "chunk.wav",
    content_type: str | None = None,
    language: str | None = None,
    prompt: str | None = None,
) -> str:
    resolved_key = resolve_api_key(api_key)

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty",
        )

    resolved_content_type = (content_type or "").strip() or "application/octet-stream"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {resolved_key}"},
                files={"file": (filename, audio_bytes, resolved_content_type)},
                data={
                    "model": TRANSCRIBE_MODEL,
                    "response_format": "text",
                    "language": (language or "en").strip() or "en",
                    **({"prompt": prompt.strip()} if prompt and prompt.strip() else {}),
                    "temperature": "0",
                },
            )
            response.raise_for_status()
            text = response.text.strip()

        if not text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Transcription returned empty text",
            )

        return text
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        upstream_status = exc.response.status_code
        upstream_body = exc.response.text.strip() or "Upstream transcription request failed"
        mapped_status = upstream_status if 400 <= upstream_status < 500 else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(
            status_code=mapped_status,
            detail=f"Groq transcription error ({upstream_status}): {upstream_body}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to transcribe audio: {exc}",
        ) from exc
