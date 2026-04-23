from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


SuggestionType = Literal[
    "question_to_ask",
    "talking_point",
    "direct_answer",
    "fact_check",
    "clarification",
]


class TranscriptChunk(BaseModel):
    text: str = Field(..., min_length=1)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    speaker: Optional[str] = None


class Suggestion(BaseModel):
    type: SuggestionType
    title: str = Field(..., min_length=1, max_length=120)
    preview: str = Field(..., min_length=1, max_length=500)
    why_now: str = Field(..., min_length=1, max_length=280)


class SuggestionBatch(BaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    suggestions: List[Suggestion]

    @field_validator("suggestions")
    @classmethod
    def validate_exactly_three(cls, value: List[Suggestion]) -> List[Suggestion]:
        if len(value) != 3:
            raise ValueError("suggestions must contain exactly 3 items")
        return value


class PromptSettings(BaseModel):
    suggestions_prompt: Optional[str] = None
    detailed_answer_prompt: Optional[str] = None
    chat_prompt: Optional[str] = None
    suggestion_context_window: int = Field(default=12, ge=3, le=80)
    expanded_context_window: int = Field(default=20, ge=5, le=120)


class SuggestionRequest(BaseModel):
    api_key: str = Field(..., min_length=10)
    session_id: Optional[str] = Field(default=None, min_length=3, max_length=120)
    transcript_chunks: List[TranscriptChunk] = Field(default_factory=list)
    settings: PromptSettings = Field(default_factory=PromptSettings)


class SuggestionResponse(BaseModel):
    batch: SuggestionBatch


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    api_key: str = Field(..., min_length=10)
    user_message: str = Field(..., min_length=1)
    transcript_chunks: List[TranscriptChunk] = Field(default_factory=list)
    chat_history: List[ChatMessage] = Field(default_factory=list)
    settings: PromptSettings = Field(default_factory=PromptSettings)


class ChatResponse(BaseModel):
    answer: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TranscribeResponse(BaseModel):
    text: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[Any] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "twinmind-backend"
