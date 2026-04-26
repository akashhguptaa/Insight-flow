from __future__ import annotations

import json
import logging
import os
from typing import Any, Tuple

from app.services.groq_client import TEXT_MODEL
from app.services.suggestions.parsing import extract_json

logger = logging.getLogger(__name__)


def _suggestions_debug() -> bool:
    return os.environ.get("DEBUG_SUGGESTIONS", "").lower() in ("1", "true", "yes")


def request_suggestions_payload(
    *,
    client,
    system_prompt: str,
    user_prompt: str,
    strict_json: bool,
) -> Tuple[dict, str]:
    request_kwargs: dict[str, Any] = {
        "model": TEXT_MODEL,
        "temperature": 0.15,
        "max_tokens": 900,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if strict_json:
        request_kwargs["response_format"] = {"type": "json_object"}

    completion = client.chat.completions.create(**request_kwargs)
    content = completion.choices[0].message.content or "{}"
    if _suggestions_debug():
        logger.info("suggestions.raw_model_content=%s", content[:2000])
    try:
        parsed = extract_json(content)
    except (ValueError, json.JSONDecodeError) as exc:
        if _suggestions_debug():
            logger.info(
                "suggestions.model_parse_failed error_type=%s content=%s",
                type(exc).__name__,
                content[:2000],
            )
        raise
    return parsed, content
