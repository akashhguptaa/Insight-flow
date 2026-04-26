from __future__ import annotations

from typing import List, Sequence

from app.models.schemas import SuggestionRequest
from app.utils.generate_summary import generate_structured_summary
from app.utils.state import (
    get_or_create_session_state,
    mark_summary_refreshed,
    should_refresh_summary,
    sync_transcript_dictionary,
)


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


def _build_follow_up_context(follow_up_history: List[str]) -> str:
    if not follow_up_history:
        return "No previous follow-up suggestions in this session yet."

    trimmed = _dedupe_recent(follow_up_history, limit=6)
    lines = [f"- {item}" for item in trimmed]
    return "\n".join(lines)


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

    if should_refresh_summary(state):
        delta_chunks = transcript_chunks[state.last_summary_transcript_index :]
        if delta_chunks:
            state.rolling_summary = generate_structured_summary(
                client=client,
                previous_summary=state.rolling_summary,
                chunks=delta_chunks,
            )
            mark_summary_refreshed(state, len(transcript_chunks))

    follow_up_context = _build_follow_up_context(state.follow_up_history)

    if state.rolling_summary:
        timestamp_context = _tail_timestamp_context_text(
            state.transcript_by_timestamp,
            window=request.settings.suggestion_context_window,
        )
        return (
            "Context mode: cached\n\n"
            "Structured summary:\n"
            f"{state.rolling_summary}\n\n"
            "Recent transcript tail (timestamped):\n"
            f"{timestamp_context}\n\n"
            "Previous follow-up suggestions:\n"
            f"{follow_up_context}"
        )

    transcript_context = _recent_transcript_text(request)
    return (
        "Context mode: live\n\n"
        "Transcript context:\n"
        f"{transcript_context}\n\n"
        "Previous follow-up suggestions:\n"
        f"{follow_up_context}"
    )
