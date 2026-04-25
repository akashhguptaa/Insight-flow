from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from threading import Lock
from typing import Dict, List, Tuple


SUMMARY_INTERVAL_SECONDS = 75
RECENT_TRANSCRIPT_CONTEXT_SIZE = 20
FOLLOW_UP_CONTEXT_LIMIT = 12


logger = logging.getLogger(__name__)


@dataclass
class SessionSuggestionState:
	session_id: str
	started_at: datetime
	next_summary_due_at: datetime
	last_summary_transcript_index: int = 0
	rolling_summary: str | None = None
	follow_up_history: List[str] = field(default_factory=list)
	transcript_by_timestamp: Dict[str, str] = field(default_factory=dict)
	last_generation_source: str | None = None
	last_generation_error: str | None = None


_STATE_BY_SESSION: Dict[str, SessionSuggestionState] = {}
_STATE_LOCK = Lock()


def _utcnow() -> datetime:
	return datetime.utcnow()


def get_or_create_session_state(session_id: str) -> SessionSuggestionState:
	now = _utcnow()
	with _STATE_LOCK:
		state = _STATE_BY_SESSION.get(session_id)
		if state is not None:
			logger.info(
				"state.reuse session_id=%s transcripts=%s follow_ups=%s has_summary=%s next_summary_due_at=%s",
				session_id,
				len(state.transcript_by_timestamp),
				len(state.follow_up_history),
				bool(state.rolling_summary),
				state.next_summary_due_at.isoformat(),
			)
			return state

		created = SessionSuggestionState(
			session_id=session_id,
			started_at=now,
			next_summary_due_at=now + timedelta(seconds=SUMMARY_INTERVAL_SECONDS),
		)
		_STATE_BY_SESSION[session_id] = created
		logger.info(
			"state.create session_id=%s started_at=%s next_summary_due_at=%s",
			session_id,
			created.started_at.isoformat(),
			created.next_summary_due_at.isoformat(),
		)
		return created


def should_refresh_summary(state: SessionSuggestionState) -> bool:
	return _utcnow() >= state.next_summary_due_at


def mark_summary_refreshed(state: SessionSuggestionState, transcript_count: int) -> None:
	state.last_summary_transcript_index = transcript_count
	state.next_summary_due_at = _utcnow() + timedelta(seconds=SUMMARY_INTERVAL_SECONDS)
	logger.info(
		"state.summary_refreshed session_id=%s transcript_count=%s next_summary_due_at=%s",
		state.session_id,
		transcript_count,
		state.next_summary_due_at.isoformat(),
	)


def push_follow_up_batch(
	state: SessionSuggestionState,
	*,
	titles: List[str],
	limit: int = FOLLOW_UP_CONTEXT_LIMIT,
) -> None:
	recent_seen = set(state.follow_up_history[-limit:])
	added_count = 0
	for title in titles:
		value = (title or "").strip()
		if not value:
			continue
		if value in recent_seen:
			continue
		state.follow_up_history.append(value)
		recent_seen.add(value)
		added_count += 1

	if len(state.follow_up_history) > limit:
		state.follow_up_history = state.follow_up_history[-limit:]
	logger.info(
		"state.followups_updated session_id=%s added=%s total=%s latest=%s",
		state.session_id,
		added_count,
		len(state.follow_up_history),
		state.follow_up_history[-1] if state.follow_up_history else "",
	)


def recent_transcript_slice_start(total_count: int) -> int:
	return max(0, total_count - RECENT_TRANSCRIPT_CONTEXT_SIZE)


def sync_transcript_dictionary(
	state: SessionSuggestionState,
	*,
	entries: List[Tuple[str, str]],
	max_items: int = 500,
) -> None:
	normalized: Dict[str, str] = {}
	for timestamp, text in entries:
		ts = (timestamp or "").strip()
		value = (text or "").strip()
		if not ts or not value:
			continue
		normalized[ts] = value

	if len(normalized) > max_items:
		items = list(normalized.items())[-max_items:]
		state.transcript_by_timestamp = dict(items)
		logger.info(
			"state.transcripts_synced session_id=%s total=%s trimmed_to=%s",
			state.session_id,
			len(normalized),
			len(state.transcript_by_timestamp),
		)
		return

	state.transcript_by_timestamp = normalized
	logger.info(
		"state.transcripts_synced session_id=%s total=%s",
		state.session_id,
		len(state.transcript_by_timestamp),
	)


def recent_transcripts_from_state(
	state: SessionSuggestionState,
	*,
	limit: int = RECENT_TRANSCRIPT_CONTEXT_SIZE,
) -> List[str]:
	values = list(state.transcript_by_timestamp.values())
	if not values:
		return []
	return values[-limit:]


def set_generation_status(
	state: SessionSuggestionState,
	*,
	source: str,
	error: str | None = None,
) -> None:
	state.last_generation_source = source
	state.last_generation_error = error
	logger.info(
		"state.generation_status session_id=%s source=%s has_error=%s",
		state.session_id,
		source,
		bool(error),
	)

