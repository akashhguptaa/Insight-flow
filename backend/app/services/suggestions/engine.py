from __future__ import annotations

import json
import logging

from fastapi import HTTPException, status
from groq import APIConnectionError, APIStatusError, APITimeoutError

from app.models.schemas import SuggestionBatch, SuggestionRequest
from app.prompts.suggestions_prompt import DEFAULT_SUGGESTIONS_SYSTEM_PROMPT
from app.services.groq_client import get_groq_client
from app.services.suggestions.context import build_cached_context
from app.services.suggestions.llm import request_suggestions_payload
from app.services.suggestions.parsing import (
    fallback_suggestions_from_context,
    normalize_suggestions_with_meta,
    safe_failed_generation_suggestions,
)
from app.utils.state import (
    get_or_create_session_state,
    push_follow_up_batch,
    set_generation_status,
)

logger = logging.getLogger(__name__)


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
        "Generate exactly 3 live suggestions from the transcript context below.\n\n"
        "Important:\n"
        "- Focus mostly on the latest transcript lines.\n"
        "- Each suggestion must be grounded in the actual topic.\n"
        "- Reject generic meeting advice.\n"
        "- If the latest transcript is unclear, produce clarifying suggestions instead of pretending there is a business decision.\n\n"
        "Transcript context:\n"
        f"{suggestion_context}\n\n"
        "Return only valid JSON in the required shape."
    )

    try:
        logger.info(
            "suggestions.generate_start session_id=%s transcripts=%s",
            request.session_id or f"api:{request.api_key[-8:]}",
            len(request.transcript_chunks),
        )
        try:
            parsed, _raw_model_content = request_suggestions_payload(
                client=client,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                strict_json=True,
            )
            model_path = "strict_json"
        except APIStatusError as exc:
            recovered = safe_failed_generation_suggestions(exc.body, context=suggestion_context)
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
                return recovered

            logger.warning("suggestions.strict_json_retry_fallback enabled=true")
            parsed, _raw_model_content = request_suggestions_payload(
                client=client,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                strict_json=False,
            )
            model_path = "retry_json_text"

        batch, used_fallback, n_from_model = normalize_suggestions_with_meta(
            parsed,
            context=suggestion_context,
        )
        if used_fallback:
            set_generation_status(
                state,
                source="fallback_contextual" if n_from_model == 0 else model_path,
                error="normalized_with_contextual_fallback",
            )
        else:
            set_generation_status(state, source=model_path, error=None)
            push_follow_up_batch(
                state,
                titles=[f"{s.type}: {s.title}" for s in batch.suggestions],
            )

        logger.info(
            "suggestions.generate_done session_id=%s suggestions=%s used_fallback=%s n_from_model=%s",
            session_key,
            len(batch.suggestions),
            used_fallback,
            n_from_model,
        )

        return batch
    except HTTPException:
        raise
    except APIStatusError as exc:
        upstream_status = exc.status_code
        upstream_body = exc.body

        recovered = safe_failed_generation_suggestions(upstream_body, context=suggestion_context)
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
        raise HTTPException(
            status_code=mapped_status,
            detail=f"Suggestions upstream error ({upstream_status}): {upstream_detail}",
        ) from exc
    except (APITimeoutError, APIConnectionError) as exc:
        set_generation_status(state, source="connectivity_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Suggestions upstream connectivity error: {exc}",
        ) from exc
    except (json.JSONDecodeError, ValueError) as exc:
        batch = SuggestionBatch(suggestions=fallback_suggestions_from_context(suggestion_context))
        set_generation_status(
            state,
            source="fallback_contextual",
            error=f"json_decode_or_value_error:{type(exc).__name__}",
        )
        return batch
    except Exception as exc:
        set_generation_status(state, source="internal_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate suggestions: {exc}",
        ) from exc
