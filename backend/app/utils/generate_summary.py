from __future__ import annotations

import json
import logging
from typing import List

from app.models.schemas import TranscriptChunk
from app.services.groq_client import TEXT_MODEL


logger = logging.getLogger(__name__)


def _format_transcript(chunks: List[TranscriptChunk]) -> str:
	if not chunks:
		return "No transcript captured yet."

	lines: List[str] = []
	for chunk in chunks:
		speaker = f"[{chunk.speaker}] " if chunk.speaker else ""
		lines.append(f"- {speaker}{chunk.text}")
	return "\n".join(lines)


def _fallback_summary(previous_summary: str | None, chunks: List[TranscriptChunk]) -> str:
	if not chunks:
		return previous_summary or "No transcript context available yet."

	recent = chunks[-8:]
	bullet_points = "\n".join(f"- {chunk.text}" for chunk in recent)
	prior = previous_summary.strip() if previous_summary else "No prior summary available."

	return (
		"## Session Summary\n"
		f"{prior}\n\n"
		"## New Facts and Signals\n"
		f"{bullet_points}\n\n"
		"## Decisions and Next Actions\n"
		"- Decision: Not explicitly stated in this window.\n"
		"- Action: Confirm ownership, deadline, and success metric for the latest topic.\n\n"
		"## Risks or Open Questions\n"
		"- Clarify assumptions that were stated without evidence.\n"
	)


def generate_structured_summary(
	*,
	client,
	previous_summary: str | None,
	chunks: List[TranscriptChunk],
) -> str:
	logger.info(
		"summary.generate_start chunks=%s has_previous=%s",
		len(chunks),
		bool(previous_summary),
	)
	transcript_text = _format_transcript(chunks)
	prior_summary = previous_summary.strip() if previous_summary else "None yet"

	system_prompt = (
		"You are a meeting intelligence summarizer. "
		"Create a compact but detailed structured summary grounded only in transcript evidence."
	)
	user_prompt = (
		"Update the running meeting summary using prior summary and new transcript chunks.\n\n"
		"Return JSON with these string fields only:\n"
		"- executive_summary\n"
		"- facts_presented\n"
		"- decisions_or_commitments\n"
		"- open_questions_or_risks\n"
		"- next_actions\n\n"
		"Rules:\n"
		"- If evidence is missing, say it is unclear.\n"
		"- Do not invent names, dates, or metrics.\n"
		"- Keep each field concise but specific.\n\n"
		f"Prior summary:\n{prior_summary}\n\n"
		f"New transcript window:\n{transcript_text}"
	)

	try:
		completion = client.chat.completions.create(
			model=TEXT_MODEL,
			temperature=0.15,
			max_tokens=700,
			response_format={"type": "json_object"},
			messages=[
				{"role": "system", "content": system_prompt},
				{"role": "user", "content": user_prompt},
			],
		)
		content = completion.choices[0].message.content or "{}"
		payload = json.loads(content)

		sections = [
			("Executive Summary", payload.get("executive_summary", "")),
			("Facts Presented", payload.get("facts_presented", "")),
			("Decisions or Commitments", payload.get("decisions_or_commitments", "")),
			("Open Questions or Risks", payload.get("open_questions_or_risks", "")),
			("Next Actions", payload.get("next_actions", "")),
		]

		rendered = []
		for title, body in sections:
			value = str(body).strip() or "Unclear from available transcript evidence."
			rendered.append(f"## {title}\n{value}")

		logger.info("summary.generate_done chunks=%s", len(chunks))
		return "\n\n".join(rendered)
	except Exception as exc:
		logger.exception("summary.generate_fallback chunks=%s error=%s", len(chunks), exc)
		return _fallback_summary(previous_summary=previous_summary, chunks=chunks)

