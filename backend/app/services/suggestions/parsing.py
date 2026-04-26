from __future__ import annotations

import json
import os
import re
from typing import Any, List, Optional

from app.models.schemas import Suggestion, SuggestionBatch
from app.services.suggestions.constants import ALLOWED_SUGGESTION_TYPES

GENERIC_PHRASES = [
    "immediate decision",
    "concrete next step",
    "success metric",
    "move the conversation forward",
    "validate key assumption",
    "committing to a plan",
    "owner, deadline",
    "clear next decision",
    "action-oriented framing",
    "current discussion likely needs",
]


def debug_suggestions_enabled() -> bool:
    return os.environ.get("DEBUG_SUGGESTIONS", "").lower() in ("1", "true", "yes")


def is_generic_suggestion_text(text: str) -> bool:
    value = text.lower()
    return any(phrase in value for phrase in GENERIC_PHRASES)


def has_context_anchor(suggestion: Suggestion, context: str) -> bool:
    """
    Soft heuristic: a suggestion is better if it shares at least one meaningful word
    with the recent transcript context.
    """
    if not context.strip():
        return True

    suggestion_text = f"{suggestion.title} {suggestion.preview} {suggestion.why_now}"
    suggestion_words = {w.lower() for w in re.findall(r"[a-zA-Z]{4,}", suggestion_text)}
    context_words = {w.lower() for w in re.findall(r"[a-zA-Z]{4,}", context)}

    stopwords = {
        "that", "this", "with", "from", "have", "what", "when", "where",
        "would", "could", "should", "about", "there", "their", "need",
        "just", "your", "they", "them", "into", "than", "then",
    }

    suggestion_words -= stopwords
    context_words -= stopwords

    if not suggestion_words or not context_words:
        return True

    return bool(suggestion_words & context_words)


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


def extract_recent_context_line(context: str) -> str:
    lines = [line.strip() for line in context.splitlines() if line.strip()]
    if not lines:
        return ""
    return lines[-1]


def fallback_suggestions_from_context(context: str) -> list[Suggestion]:
    latest = trim(extract_recent_context_line(context), 180)

    if latest:
        quoted_latest = f"“{latest}”"
    else:
        quoted_latest = "the latest point"

    return [
        Suggestion(
            type="clarification",
            title="Clarify the meaning",
            preview=f"Can you clarify what you mean by {quoted_latest}?",
            why_now="The latest transcript sounds ambiguous, so clarifying the speaker's intent is more useful than guessing.",
        ),
        Suggestion(
            type="question_to_ask",
            title="Ask the real goal",
            preview="What outcome are you hoping for here: understanding the issue, deciding what to do, or forming a clearer opinion?",
            why_now="The speaker seems uncertain about the next useful direction.",
        ),
        Suggestion(
            type="talking_point",
            title="Separate facts and feelings",
            preview="It may help to separate what you feel strongly about, what facts you know, and what action is actually possible.",
            why_now="The discussion includes uncertainty and would benefit from a clearer frame.",
        ),
    ]


def _append_rejection(
    debug_rejections: list[dict] | None,
    item: Any,
    reason: str,
    detail: str = "",
) -> None:
    if debug_rejections is None:
        return
    entry: dict[str, Any] = {"item": item, "reason": reason}
    if detail:
        entry["detail"] = detail
    debug_rejections.append(entry)


def safe_failed_generation_suggestions(
    body: Any,
    *,
    context: str = "",
) -> SuggestionBatch | None:
    if not isinstance(body, dict):
        return None

    error_obj = body.get("error")
    if not isinstance(error_obj, dict):
        return None

    if error_obj.get("code") != "json_validate_failed":
        return None

    failed_generation = error_obj.get("failed_generation")
    if not isinstance(failed_generation, str):
        return SuggestionBatch(suggestions=fallback_suggestions_from_context(context))

    try:
        parsed: Any = json.loads(failed_generation)
    except json.JSONDecodeError:
        return SuggestionBatch(suggestions=fallback_suggestions_from_context(context))

    if isinstance(parsed, dict) and "suggestions" in parsed:
        batch, _, _n = normalize_suggestions_with_meta(
            parsed,
            context=context,
        )
        return SuggestionBatch(suggestions=batch.suggestions)

    if isinstance(parsed, list):
        batch, _, _n = normalize_suggestions_with_meta(
            {"suggestions": parsed},
            context=context,
        )
        return SuggestionBatch(suggestions=batch.suggestions)

    return SuggestionBatch(suggestions=fallback_suggestions_from_context(context))


def normalize_suggestions(raw: dict) -> SuggestionBatch:
    batch, _, _n = normalize_suggestions_with_meta(raw, context="")
    return batch


def normalize_suggestions_with_meta(
    raw: dict,
    *,
    context: str = "",
    debug_rejections: Optional[List[dict]] = None,
) -> tuple[SuggestionBatch, bool, int]:
    suggestions_raw = raw.get("suggestions")
    if suggestions_raw is None and isinstance(raw.get("batch"), dict):
        suggestions_raw = raw["batch"].get("suggestions", [])

    if suggestions_raw is None:
        suggestions_raw = []

    if not isinstance(suggestions_raw, list):
        raise ValueError("suggestions must be a list")

    suggestions: list[Suggestion] = []
    used_fallback = False

    for item in suggestions_raw[:5]:
        if not isinstance(item, dict):
            _append_rejection(
                debug_rejections, item, "not_a_dict", "suggestion must be a JSON object"
            )
            continue

        suggestion_type = str(item.get("type", "")).strip()
        if suggestion_type not in ALLOWED_SUGGESTION_TYPES:
            _append_rejection(
                debug_rejections, item, "invalid_type", f"type not in {ALLOWED_SUGGESTION_TYPES}"
            )
            continue

        title = trim(str(item.get("title", "")), 120)
        preview = trim(str(item.get("preview", "")), 500)
        why_now = trim(str(item.get("why_now", "")), 280)

        if not title or not preview or not why_now:
            _append_rejection(debug_rejections, item, "missing_fields", "title, preview, and why_now required")
            continue

        try:
            candidate = Suggestion.model_validate(
                {
                    "type": suggestion_type,
                    "title": title,
                    "preview": preview,
                    "why_now": why_now,
                }
            )
        except Exception as e:
            _append_rejection(debug_rejections, item, "validation_error", str(e))
            continue

        combined_text = f"{title} {preview} {why_now}"
        if is_generic_suggestion_text(combined_text):
            _append_rejection(debug_rejections, item, "generic_filler", "matches banned generic business phrases")
            continue

        if not has_context_anchor(candidate, context):
            _append_rejection(debug_rejections, item, "no_context_anchor", "no meaningful word overlap with context")
            continue

        suggestions.append(candidate)

    n_from_model = len(suggestions)
    if len(suggestions) < 3:
        used_fallback = True
        fallback_items = fallback_suggestions_from_context(context)
        for fallback in fallback_items:
            if len(suggestions) >= 3:
                break
            suggestions.append(fallback)

    return SuggestionBatch(suggestions=suggestions[:3]), used_fallback, n_from_model
