from __future__ import annotations

import json
import re
from typing import Any, List

from app.models.schemas import Suggestion, SuggestionBatch
from app.services.suggestions.constants import ALLOWED_SUGGESTION_TYPES


def extract_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("{") and content.endswith("}"):
        return json.loads(content)

    match = re.search(r"\{.*\}", content, flags=re.DOTALL)
    if not match:
        raise ValueError("Model did not return JSON")
    return json.loads(match.group(0))


def trim(text: str, max_len: int) -> str:
    value = (text or "").strip()
    return value[:max_len].strip() if value else ""


def fallback_suggestions() -> list[Suggestion]:
    return [
        Suggestion(
            type="question_to_ask",
            title="Clarify the immediate decision",
            preview="Ask what must be decided right now and what can wait until later.",
            why_now="The current discussion likely needs a clear next decision.",
        ),
        Suggestion(
            type="talking_point",
            title="Propose one concrete next step",
            preview="Suggest a single owner, deadline, and success metric to move the conversation forward.",
            why_now="Action-oriented framing helps convert discussion into execution.",
        ),
        Suggestion(
            type="fact_check",
            title="Validate key assumption",
            preview="Confirm the most important claim with data before committing to a plan.",
            why_now="A quick validation reduces the chance of acting on a wrong assumption.",
        ),
    ]


def safe_failed_generation_suggestions(body: Any) -> SuggestionBatch | None:
    if not isinstance(body, dict):
        return None

    error_obj = body.get("error")
    if not isinstance(error_obj, dict):
        return None

    if error_obj.get("code") != "json_validate_failed":
        return None

    failed_generation = error_obj.get("failed_generation")
    if not isinstance(failed_generation, str):
        return SuggestionBatch(suggestions=fallback_suggestions())

    try:
        parsed = json.loads(failed_generation)
    except json.JSONDecodeError:
        return SuggestionBatch(suggestions=fallback_suggestions())

    if not isinstance(parsed, list):
        return SuggestionBatch(suggestions=fallback_suggestions())

    suggestions: list[Suggestion] = []
    for item in parsed[:3]:
        text = str(item).strip()
        if not text:
            continue
        suggestions.append(
            Suggestion(
                type="talking_point",
                title=trim(text, 120) or "Actionable talking point",
                preview=trim(text, 500)
                or "Use this moment to move the discussion toward a concrete outcome.",
                why_now="Recovered from model formatting failure; aligned with current context.",
            )
        )

    if len(suggestions) < 3:
        for fallback in fallback_suggestions():
            if len(suggestions) >= 3:
                break
            suggestions.append(fallback)

    return SuggestionBatch(suggestions=suggestions[:3])


def normalize_suggestions(raw: dict) -> SuggestionBatch:
    suggestions_raw = raw.get("suggestions")
    if suggestions_raw is None and isinstance(raw.get("batch"), dict):
        suggestions_raw = raw["batch"].get("suggestions", [])

    if suggestions_raw is None:
        suggestions_raw = []

    if not isinstance(suggestions_raw, list):
        raise ValueError("suggestions must be a list")

    suggestions: List[Suggestion] = []
    for item in suggestions_raw[:3]:
        if not isinstance(item, dict):
            continue
        try:
            suggestion_type = str(item.get("type", "")).strip()
            if suggestion_type not in ALLOWED_SUGGESTION_TYPES:
                suggestion_type = "talking_point"

            normalized = {
                "type": suggestion_type,
                "title": trim(str(item.get("title", "")), 120)
                or "Actionable talking point",
                "preview": trim(str(item.get("preview", "")), 500)
                or "Use this moment to move the discussion toward a concrete outcome.",
                "why_now": trim(str(item.get("why_now", "")), 280)
                or "It aligns with the latest discussion context.",
            }
            suggestions.append(Suggestion.model_validate(normalized))
        except Exception:
            continue

    if len(suggestions) < 3:
        for fallback in fallback_suggestions():
            if len(suggestions) >= 3:
                break
            suggestions.append(fallback)

    return SuggestionBatch(suggestions=suggestions[:3])


def normalize_suggestions_with_meta(raw: dict) -> tuple[SuggestionBatch, bool]:
    suggestions_raw = raw.get("suggestions")
    if suggestions_raw is None and isinstance(raw.get("batch"), dict):
        suggestions_raw = raw["batch"].get("suggestions", [])

    if suggestions_raw is None:
        suggestions_raw = []

    if not isinstance(suggestions_raw, list):
        raise ValueError("suggestions must be a list")

    suggestions: List[Suggestion] = []
    used_fallback = False

    for item in suggestions_raw[:3]:
        if not isinstance(item, dict):
            continue
        try:
            suggestion_type = str(item.get("type", "")).strip()
            if suggestion_type not in ALLOWED_SUGGESTION_TYPES:
                suggestion_type = "talking_point"

            normalized = {
                "type": suggestion_type,
                "title": trim(str(item.get("title", "")), 120)
                or "Actionable talking point",
                "preview": trim(str(item.get("preview", "")), 500)
                or "Use this moment to move the discussion toward a concrete outcome.",
                "why_now": trim(str(item.get("why_now", "")), 280)
                or "It aligns with the latest discussion context.",
            }
            suggestions.append(Suggestion.model_validate(normalized))
        except Exception:
            continue

    if len(suggestions) < 3:
        used_fallback = True
        for fallback in fallback_suggestions():
            if len(suggestions) >= 3:
                break
            suggestions.append(fallback)

    return SuggestionBatch(suggestions=suggestions[:3]), used_fallback
