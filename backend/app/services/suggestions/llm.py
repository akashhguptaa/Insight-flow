from __future__ import annotations

from typing import Any

from app.services.groq_client import TEXT_MODEL
from app.services.suggestions.parsing import extract_json


def request_suggestions_payload(
    *,
    client,
    system_prompt: str,
    user_prompt: str,
    strict_json: bool,
) -> dict:
    request_kwargs: dict[str, Any] = {
        "model": TEXT_MODEL,
        "temperature": 0.35,
        "max_tokens": 700,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if strict_json:
        request_kwargs["response_format"] = {"type": "json_object"}

    completion = client.chat.completions.create(**request_kwargs)
    content = completion.choices[0].message.content or "{}"
    return extract_json(content)
