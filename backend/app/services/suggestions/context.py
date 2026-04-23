from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import List, Sequence

from app.models.schemas import SuggestionRequest
from app.utils.generate_summary import generate_structured_summary
from app.utils.state import (
    get_or_create_session_state,
    mark_summary_refreshed,
    recent_transcripts_from_state,
    sync_transcript_dictionary,
    should_refresh_summary,
)


logger = logging.getLogger(__name__)

_CONTEXT_LOG_LOCK = Lock()
_CONTEXT_LOG_FILE = Path(__file__).resolve().parents[2] / "logs" / "suggestion_context_state.jsonl"


def _log_context_state(payload: dict) -> None:
    try:
        _CONTEXT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with _CONTEXT_LOG_LOCK:
            with _CONTEXT_LOG_FILE.open("a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=True, default=str))
                f.write("\n")
    except Exception as exc:
        logger.exception("suggestions.context_state_log_failed error=%s", exc)


def _timestamp_context_from_chunks(chunks: Sequence, *, window: int) -> str:
    recent = chunks[-window:]
    if not recent:
        return "No transcript captured yet."

    lines: List[str] = []
    for chunk in recent:
        speaker = f"[{chunk.speaker}] " if getattr(chunk, "speaker", None) else ""
        lines.append(f"- {chunk.timestamp.isoformat()}: {speaker}{chunk.text}")
    return "\n".join(lines)


def _recent_transcript_text(request: SuggestionRequest) -> str:
    window = request.settings.suggestion_context_window
    chunks = request.transcript_chunks
    return _timestamp_context_from_chunks(chunks, window=window)


def _tail_timestamp_context_text(transcript_by_timestamp: dict[str, str], *, window: int) -> str:
    if not transcript_by_timestamp:
        return "No timestamp transcript context available yet."

    items = list(transcript_by_timestamp.items())[-window:]
    lines = [f"- {timestamp}: {text}" for timestamp, text in items]
    return "\n".join(lines)


def _dedupe_recent(items: List[str], *, limit: int) -> List[str]:
    if not items:
        return []

    deduped_reversed: List[str] = []
    seen: set[str] = set()
    for item in reversed(items):
        if item in seen:
            continue
        seen.add(item)
        deduped_reversed.append(item)
        if len(deduped_reversed) >= limit:
            break

    return list(reversed(deduped_reversed))
    if not chunks:
        return "No transcript captured yet."

    lines: List[str] = []
    for chunk in chunks:
        speaker = f"[{chunk.speaker}] " if chunk.speaker else ""
        lines.append(f"- {speaker}{chunk.text}")
    return "\n".join(lines)


def _build_follow_up_context(follow_up_history: List[str]) -> str:
    if not follow_up_history:
        return "No previous follow-up suggestions in this session yet."

    trimmed = _dedupe_recent(follow_up_history, limit=6)
    lines = [f"- {item}" for item in trimmed]
    return "\n".join(lines)


def _timestamp_context_text(transcript_by_timestamp: dict[str, str]) -> str:
    return _tail_timestamp_context_text(transcript_by_timestamp, window=20)


def build_cached_context(request: SuggestionRequest, client) -> str:
    session_key = request.session_id or f"api:{request.api_key[-8:]}"
    state = get_or_create_session_state(session_key)

    transcript_chunks = request.transcript_chunks
    transcript_entries = [
        (
            chunk.timestamp.isoformat(),
            f"{f'[{chunk.speaker}] ' if chunk.speaker else ''}{chunk.text}",
        )
        for chunk in transcript_chunks
    ]
    sync_transcript_dictionary(state, entries=transcript_entries)
    logger.info(
        "suggestions.context_sync session_id=%s request_transcripts=%s state_transcripts=%s",
        session_key,
        len(transcript_chunks),
        len(state.transcript_by_timestamp),
    )

    if should_refresh_summary(state):
        delta_chunks = transcript_chunks[state.last_summary_transcript_index :]
        logger.info(
            "suggestions.summary_due session_id=%s delta_chunks=%s last_summary_index=%s",
            session_key,
            len(delta_chunks),
            state.last_summary_transcript_index,
        )
        if delta_chunks:
            state.rolling_summary = generate_structured_summary(
                client=client,
                previous_summary=state.rolling_summary,
                chunks=delta_chunks,
            )
            mark_summary_refreshed(state, len(transcript_chunks))
            logger.info(
                "suggestions.summary_updated session_id=%s summary_chars=%s",
                session_key,
                len(state.rolling_summary or ""),
            )

    follow_up_context = _build_follow_up_context(state.follow_up_history)
    base_payload = {
        "logged_at": datetime.utcnow().isoformat(),
        "session_id": session_key,
        "request": {
            "transcript_chunk_count": len(request.transcript_chunks),
            "settings": request.settings.model_dump(),
        },
        "state": {
            "started_at": state.started_at.isoformat(),
            "next_summary_due_at": state.next_summary_due_at.isoformat(),
            "last_summary_transcript_index": state.last_summary_transcript_index,
            "rolling_summary": state.rolling_summary,
            "follow_up_history": state.follow_up_history,
            "transcript_by_timestamp": state.transcript_by_timestamp,
            "last_generation_source": state.last_generation_source,
            "last_generation_error": state.last_generation_error,
        },
    }

    if state.rolling_summary:
        timestamp_context = _tail_timestamp_context_text(
            state.transcript_by_timestamp,
            window=request.settings.suggestion_context_window,
        )
        logger.info(
            "suggestions.context_mode session_id=%s mode=cached summary=true recent_lines=%s followups=%s",
            session_key,
            len(recent_transcripts_from_state(state)),
            len(state.follow_up_history),
        )

        context_text = (
            "Context mode: cached\n\n"
            "Structured summary:\n"
            f"{state.rolling_summary}\n\n"
            "Recent transcript tail (timestamped):\n"
            f"{timestamp_context}\n\n"
            "Previous follow-up suggestions:\n"
            f"{follow_up_context}"
        )
        _log_context_state(
            {
                **base_payload,
                "context": {
                    "mode": "cached",
                    "timestamp_context": timestamp_context,
                    "follow_up_context": follow_up_context,
                },
            }
        )
        return context_text

    transcript_context = _recent_transcript_text(request)
    logger.info(
        "suggestions.context_mode session_id=%s mode=live summary=false followups=%s",
        session_key,
        len(state.follow_up_history),
    )
    context_text = (
        "Context mode: live\n\n"
        "Transcript context:\n"
        f"{transcript_context}\n\n"
        "Previous follow-up suggestions:\n"
        f"{follow_up_context}"
    )
    _log_context_state(
        {
            **base_payload,
            "context": {
                "mode": "live",
                "timestamp_context": _timestamp_context_text(state.transcript_by_timestamp),
                "follow_up_context": follow_up_context,
            },
        }
    )
    return context_text
