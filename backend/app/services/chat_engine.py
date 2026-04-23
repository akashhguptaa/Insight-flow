from __future__ import annotations

from typing import Generator, List

from fastapi import HTTPException, status

from app.models.schemas import ChatRequest
from app.prompts.chat_prompt import DEFAULT_CHAT_SYSTEM_PROMPT
from app.services.groq_client import TEXT_MODEL, get_groq_client


def _recent_transcript_text(request: ChatRequest) -> str:
    window = request.settings.expanded_context_window
    chunks = request.transcript_chunks[-window:]
    if not chunks:
        return "No transcript captured yet."

    lines: List[str] = []
    for chunk in chunks:
        speaker = f"[{chunk.speaker}] " if chunk.speaker else ""
        lines.append(f"- {speaker}{chunk.text}")
    return "\n".join(lines)


def _chat_history_text(request: ChatRequest) -> str:
    if not request.chat_history:
        return "No prior chat history."

    history = request.chat_history[-12:]
    lines = [f"- {msg.role}: {msg.content}" for msg in history]
    return "\n".join(lines)


def _build_messages(request: ChatRequest) -> list[dict[str, str]]:
    system_prompt = (
        request.settings.chat_prompt.strip()
        if request.settings.chat_prompt
        else DEFAULT_CHAT_SYSTEM_PROMPT
    )

    transcript_context = _recent_transcript_text(request)
    chat_context = _chat_history_text(request)

    user_block = (
        "Use the context to answer the latest user request.\n\n"
        "Recent transcript:\n"
        f"{transcript_context}\n\n"
        "Recent chat history:\n"
        f"{chat_context}\n\n"
        "Latest user message:\n"
        f"{request.user_message}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_block},
    ]


def stream_chat_answer(request: ChatRequest) -> Generator[str, None, None]:
    client = get_groq_client(request.api_key)
    messages = _build_messages(request)

    try:
        stream = client.chat.completions.create(
            model=TEXT_MODEL,
            temperature=0.3,
            max_tokens=1200,
            stream=True,
            messages=messages,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if not delta:
                continue
            yield f"data: {delta}\n\n"

        yield "data: [DONE]\n\n"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to stream chat answer: {exc}",
        ) from exc
