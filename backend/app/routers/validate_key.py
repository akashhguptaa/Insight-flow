from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"

router = APIRouter(tags=["key"])


class ValidateKeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=4096)


@router.post("/validate_key")
async def validate_groq_key(body: ValidateKeyRequest) -> dict[str, bool]:
    key = body.api_key.strip()
    if len(key) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key is too short.",
        )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                GROQ_MODELS_URL,
                headers={"Authorization": f"Bearer {key}"},
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Groq: {exc}",
        ) from exc

    if response.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Groq API key.",
        )
    if response.status_code == 403:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Groq API key is not allowed to access the API.",
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Groq returned an error ({response.status_code}).",
        )

    return {"ok": True}
