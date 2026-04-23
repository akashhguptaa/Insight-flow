# Suggestions Data Contract

This document explains how the frontend asks for suggestions and what the backend is expected to return.

## Endpoint

- Method: `POST`
- URL: `/api/suggestions`
- Source implementation: `lib/api.ts` (`fetchSuggestions`)

## When The Frontend Calls It

Source: `hooks/useSuggestions.ts`

The request is triggered in two ways:

1. Manual refresh
- User clicks Reload suggestions.
- `refresh()` is called.

2. Auto refresh
- Runs every 30 seconds while recording is active.
- Uses `setInterval(..., 30_000)`.

## Preconditions (Request Is Skipped If Not Met)

Source: `hooks/useSuggestions.ts`

The frontend does not call backend if:

- API key is missing (`options.apiKey` is empty)
- Transcript is empty (`options.transcript.length === 0`)
- Another refresh is already in flight (`inFlightRef.current === true`)

## Request Payload

Source: `lib/api.ts`

`fetchSuggestions` sends JSON with this shape:

```json
{
  "api_key": "<groq-key>",
  "transcript_chunks": [
    {
      "id": "optional-client-id",
      "text": "spoken text chunk",
      "timestamp": "2026-04-19T03:52:01.000Z",
      "speaker": "optional"
    }
  ],
  "settings": {
    "suggestions_prompt": "optional custom prompt",
    "detailed_answer_prompt": "optional",
    "chat_prompt": "optional",
    "suggestion_context_window": 12,
    "expanded_context_window": 20
  }
}
```

Notes:

- `transcript_chunks` is the full in-memory transcript array from store, not only the latest line.
- `suggestion_context_window` and `expanded_context_window` are numeric controls from settings.

## Expected Response

Type source: `types/index.ts`

Frontend expects:

```json
{
  "batch": {
    "created_at": "2026-04-19T03:53:00.000Z",
    "suggestions": [
      {
        "type": "question_to_ask",
        "title": "Ask about deployment timeline",
        "preview": "Should we target phased rollout or big-bang launch?",
        "why_now": "Team is discussing launch sequencing."
      },
      {
        "type": "talking_point",
        "title": "Highlight risk mitigation",
        "preview": "Mention fallback plan and monitoring checkpoints.",
        "why_now": "Concerns about reliability just surfaced."
      },
      {
        "type": "direct_answer",
        "title": "Suggested response",
        "preview": "We can ship in phases with a rollback gate each week.",
        "why_now": "A decision-oriented question was asked."
      }
    ]
  }
}
```

Important contract detail:

- `suggestions` must contain exactly 3 items.
- Allowed `type` values:
  - `question_to_ask`
  - `talking_point`
  - `direct_answer`
  - `fact_check`
  - `clarification`

## Frontend Handling Of Response

Source: `hooks/useSuggestions.ts`

- On success:
  - Calls `onBatch(result.batch)`
  - Sets `lastUpdatedAt` to current ISO timestamp
- On failure:
  - Parses backend error and sets `error`
  - Keeps previous batches in UI

## Error Behavior

Source: `lib/api.ts` and `hooks/useSuggestions.ts`

- Non-2xx responses are parsed as:
  - JSON with `detail`, if available
  - fallback: `Request failed with <status>`
- Hook exposes user-facing `error` string for panel display.

## Quick Backend Checklist

To satisfy frontend expectations, backend should:

- Accept `api_key`, `transcript_chunks`, `settings`
- Return `200` with `{ "batch": { "created_at": string, "suggestions": [3 items] } }`
- Ensure each suggestion has `type`, `title`, `preview`, `why_now`
- Return error JSON as `{ "detail": "..." }` on failure
