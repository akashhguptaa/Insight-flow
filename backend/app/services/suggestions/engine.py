from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from threading import Lock

from fastapi import HTTPException, status
from groq import APIConnectionError, APIStatusError, APITimeoutError

from app.models.schemas import SuggestionBatch, SuggestionRequest
from app.prompts.suggestions_prompt import DEFAULT_SUGGESTIONS_SYSTEM_PROMPT
from app.services.groq_client import get_groq_client
from app.services.suggestions.context import build_cached_context
from app.services.suggestions.llm import request_suggestions_payload
from app.services.suggestions.parsing import (
    fallback_suggestions,
    normalize_suggestions_with_meta,
    safe_failed_generation_suggestions,
)
from app.utils.state import (
    get_or_create_session_state,
    push_follow_up_batch,
    set_generation_status,
)


logger = logging.getLogger(__name__)

_GEN_LOG_LOCK = Lock()
_GEN_LOG_FILE = Path(__file__).resolve().parents[2] / "logs" / "suggestion_generation_state.jsonl"


def _log_generation_event(payload: dict) -> None:
    try:
        _GEN_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with _GEN_LOG_LOCK:
            with _GEN_LOG_FILE.open("a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=True, default=str))
                f.write("\n")
    except Exception as exc:
        logger.exception("suggestions.generation_log_write_failed error=%s", exc)


def build_live_suggestions(request: SuggestionRequest) -> SuggestionBatch:
    client = get_groq_client(request.api_key)
    session_key = request.session_id or f"api:{request.api_key[-8:]}"
    state = get_or_create_session_state(session_key)

    custom_prompt = (request.settings.suggestions_prompt or "").strip()
    if custom_prompt:
        # Keep the hard JSON contract from the default prompt and layer user guidance on top.
        system_prompt = (
            f"{DEFAULT_SUGGESTIONS_SYSTEM_PROMPT}\n\n"
            "Additional product guidance (follow while keeping the exact JSON output rules above):\n"
            f"{custom_prompt}"
        )
    else:
        system_prompt = DEFAULT_SUGGESTIONS_SYSTEM_PROMPT

    suggestion_context = build_cached_context(request, client)

    user_prompt = (
        "Generate live suggestions from the context below.\n\n"
        "Suggestion context:\n"
        f"{suggestion_context}\n\n"
        "Return exactly 3 suggestions in the required JSON shape."
    )

    try:
        logger.info(
            "suggestions.generate_start session_id=%s transcripts=%s",
            request.session_id or f"api:{request.api_key[-8:]}",
            len(request.transcript_chunks),
        )
        try:
            parsed = request_suggestions_payload(
                client=client,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                strict_json=True,
            )
            source = "strict_json"
        except APIStatusError as exc:
            recovered = safe_failed_generation_suggestions(exc.body)
            if recovered is not None:
                logger.warning(
                    "suggestions.json_validate_failed_recovered status=%s",
                    exc.status_code,
                )
                set_generation_status(
                    state,
                    source="strict_json_recovered",
                    error=f"json_validate_failed:{exc.status_code}",
                )
                push_follow_up_batch(
                    state,
                    titles=[f"{s.type}: {s.title}" for s in recovered.suggestions],
                )
                _log_generation_event(
                    {
                        "logged_at": datetime.utcnow().isoformat(),
                        "session_id": session_key,
                        "source": "strict_json_recovered",
                        "error": f"json_validate_failed:{exc.status_code}",
                        "suggestions": [s.model_dump() for s in recovered.suggestions],
                    }
                )
                return recovered

            logger.warning("suggestions.strict_json_retry_fallback enabled=true")
            parsed = request_suggestions_payload(
                client=client,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                strict_json=False,
            )
            source = "retry_json_text"

        batch, used_fallback = normalize_suggestions_with_meta(parsed)
        if used_fallback:
            set_generation_status(
                state,
                source="fallback_default",
                error="normalized_with_fallback",
            )
            _log_generation_event(
                {
                    "logged_at": datetime.utcnow().isoformat(),
                    "session_id": session_key,
                    "source": "fallback_default",
                    "error": "normalized_with_fallback",
                    "suggestions": [s.model_dump() for s in batch.suggestions],
                }
            )
        else:
            set_generation_status(state, source=source, error=None)
            push_follow_up_batch(
                state,
                titles=[f"{s.type}: {s.title}" for s in batch.suggestions],
            )
            _log_generation_event(
                {
                    "logged_at": datetime.utcnow().isoformat(),
                    "session_id": session_key,
                    "source": source,
                    "error": None,
                    "suggestions": [s.model_dump() for s in batch.suggestions],
                }
            )

        logger.info(
            "suggestions.generate_done session_id=%s suggestions=%s",
            session_key,
            len(batch.suggestions),
        )

        return batch
    except HTTPException:
        raise
    except APIStatusError as exc:
        upstream_status = exc.status_code
        upstream_body = exc.body

        recovered = safe_failed_generation_suggestions(upstream_body)
        if recovered is not None:
            logger.warning(
                "suggestions.json_validate_failed_recovered status=%s",
                upstream_status,
            )
            set_generation_status(
                state,
                source="strict_json_recovered",
                error=f"json_validate_failed:{upstream_status}",
            )
            push_follow_up_batch(
                state,
                titles=[f"{s.type}: {s.title}" for s in recovered.suggestions],
            )
            _log_generation_event(
                {
                    "logged_at": datetime.utcnow().isoformat(),
                    "session_id": session_key,
                    "source": "strict_json_recovered",
                    "error": f"json_validate_failed:{upstream_status}",
                    "suggestions": [s.model_dump() for s in recovered.suggestions],
                }
            )
            return recovered

        if isinstance(upstream_body, dict):
            upstream_detail = json.dumps(upstream_body)
        elif upstream_body is None:
            upstream_detail = exc.message
        else:
            upstream_detail = str(upstream_body)

        mapped_status = upstream_status if 400 <= upstream_status < 500 else status.HTTP_502_BAD_GATEWAY
        set_generation_status(
            state,
            source="upstream_error",
            error=f"{upstream_status}:{upstream_detail}",
        )
        _log_generation_event(
            {
                "logged_at": datetime.utcnow().isoformat(),
                "session_id": session_key,
                "source": "upstream_error",
                "error": f"{upstream_status}:{upstream_detail}",
                "suggestions": None,
            }
        )
        raise HTTPException(
            status_code=mapped_status,
            detail=f"Suggestions upstream error ({upstream_status}): {upstream_detail}",
        ) from exc
    except (APITimeoutError, APIConnectionError) as exc:
        set_generation_status(state, source="connectivity_error", error=str(exc))
        _log_generation_event(
            {
                "logged_at": datetime.utcnow().isoformat(),
                "session_id": session_key,
                "source": "connectivity_error",
                "error": str(exc),
                "suggestions": None,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Suggestions upstream connectivity error: {exc}",
        ) from exc
    except (json.JSONDecodeError, ValueError):
        batch = SuggestionBatch(suggestions=fallback_suggestions())
        set_generation_status(state, source="fallback_default", error="json_decode_or_value_error")
        _log_generation_event(
            {
                "logged_at": datetime.utcnow().isoformat(),
                "session_id": session_key,
                "source": "fallback_default",
                "error": "json_decode_or_value_error",
                "suggestions": [s.model_dump() for s in batch.suggestions],
            }
        )
        return batch
    except Exception as exc:
        set_generation_status(state, source="internal_error", error=str(exc))
        _log_generation_event(
            {
                "logged_at": datetime.utcnow().isoformat(),
                "session_id": session_key,
                "source": "internal_error",
                "error": str(exc),
                "suggestions": None,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate suggestions: {exc}",
        ) from exc
