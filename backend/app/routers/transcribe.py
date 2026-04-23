from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.models.schemas import TranscribeResponse
from app.services.groq_client import transcribe_audio as transcribe_audio_chunk

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


@router.post("", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile = File(...),
    api_key: str = Form(...),
    language: str | None = Form(default=None),
    prompt: str | None = Form(default=None),
) -> TranscribeResponse:
    if not audio.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio filename is required",
        )

    audio_bytes = await audio.read()
    text = await transcribe_audio_chunk(
        audio_bytes,
        api_key,
        filename=audio.filename,
        content_type=audio.content_type,
        language=language,
        prompt=prompt,
    )
    return TranscribeResponse(text=text)
