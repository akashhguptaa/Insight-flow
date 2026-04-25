from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import SuggestionRequest, SuggestionResponse
from app.services.suggestion_engine import build_live_suggestions

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


@router.post("", response_model=SuggestionResponse)
def generate_suggestions(payload: SuggestionRequest) -> SuggestionResponse:
    batch = build_live_suggestions(payload)
    return SuggestionResponse(batch=batch)
