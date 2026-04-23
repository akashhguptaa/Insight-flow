# TwinMind Frontend Integration Contract

This document defines the frontend-backend API contract for your planned Next.js structure.

- Backend base URL (dev): `http://127.0.0.1:8000`
- API prefix: `/api`
- Content types:
  - `multipart/form-data` for transcription uploads
  - `application/json` for suggestions and chat
  - `text/event-stream` for streaming chat responses

## 1) Frontend Mapping (Your Structure)

Use this contract in the following files:

- `frontend/lib/api.ts`
  - Implement typed API wrappers for all endpoints in this doc.
- `frontend/hooks/useMic.ts`
  - Send mic audio chunks to `POST /api/transcribe`.
- `frontend/hooks/useSuggestions.ts`
  - Every ~30s (or manual refresh), call `POST /api/suggestions`.
- `frontend/hooks/useChat.ts`
  - Stream responses from `POST /api/chat`.
- `frontend/store/sessionStore.ts`
  - Persist transcript chunks, suggestion batches, and chat history in-memory.
- `frontend/components/settings/SettingsModal.tsx`
  - Manage API key, prompt overrides, and context window values sent in request payloads.
- `frontend/lib/export.ts`
  - Export transcript + suggestion batches + chat history with timestamps.

## 2) Common Data Shapes (Frontend Types)

Use these interfaces in `frontend/types/index.ts`.

```ts
export type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "direct_answer"
  | "fact_check"
  | "clarification";

export interface TranscriptChunk {
  text: string;
  timestamp: string; // ISO datetime
  speaker?: string;
}

export interface Suggestion {
  type: SuggestionType;
  title: string;
  preview: string;
  why_now: string;
}

export interface SuggestionBatch {
  created_at: string; // ISO datetime
  suggestions: [Suggestion, Suggestion, Suggestion]; // exactly 3
}

export interface PromptSettings {
  suggestions_prompt?: string;
  detailed_answer_prompt?: string; // currently reserved, keep for UI compatibility
  chat_prompt?: string;
  suggestion_context_window: number; // default 12
  expanded_context_window: number;   // default 20
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string; // ISO datetime
}
```

## 3) Endpoint Contract: Health

### Request
- Method: `GET`
- URL: `/health`
- Body: none

### Response 200

```json
{
  "status": "ok",
  "service": "twinmind-backend"
}
```

### Frontend usage
- Optional readiness check on app load in `frontend/app/page.tsx`.

## 4) Endpoint Contract: Transcribe

### Request
- Method: `POST`
- URL: `/api/transcribe`
- Content-Type: `multipart/form-data`
- Form fields:
  - `audio` (required): file/blob chunk from mic recorder
  - `api_key` (required): Groq API key from settings modal
  - `language` (optional): e.g. `en`
  - `prompt` (optional): whisper guidance string

### Example (frontend `FormData`)

```ts
const fd = new FormData();
fd.append("audio", blob, "chunk.webm");
fd.append("api_key", settings.apiKey);
if (settings.transcribeLanguage) fd.append("language", settings.transcribeLanguage);
if (settings.transcribePrompt) fd.append("prompt", settings.transcribePrompt);
```

### Response 200

```json
{
  "text": "We should run a pilot with enterprise customers first.",
  "timestamp": "2026-04-18T10:00:00.000000"
}
```

### Error responses
- `400` missing key / invalid upload / empty file
- `502` upstream transcription failure

Example:

```json
{
  "detail": "Failed to transcribe audio: ..."
}
```

### Frontend behavior
- In `useMic.ts`, append each response as a new `TranscriptChunk` to store.
- Keep UI auto-scrolled to latest chunk in `TranscriptPanel.tsx`.

## 5) Endpoint Contract: Suggestions

### Request
- Method: `POST`
- URL: `/api/suggestions`
- Content-Type: `application/json`

### Request Body

```json
{
  "api_key": "gsk_...",
  "transcript_chunks": [
    {
      "text": "We are losing users after week one.",
      "timestamp": "2026-04-18T10:00:00.000000",
      "speaker": "PM"
    }
  ],
  "settings": {
    "suggestions_prompt": "optional prompt override",
    "detailed_answer_prompt": "optional (reserved)",
    "chat_prompt": "optional",
    "suggestion_context_window": 12,
    "expanded_context_window": 20
  }
}
```

### Response 200
- Contract guarantee: `batch.suggestions.length === 3`

```json
{
  "batch": {
    "created_at": "2026-04-18T10:00:30.000000",
    "suggestions": [
      {
        "type": "question_to_ask",
        "title": "What is the biggest week-1 drop-off step?",
        "preview": "Ask for the single funnel step with highest abandonment to focus the fix.",
        "why_now": "Conversation is centered on week-1 churn causes."
      },
      {
        "type": "talking_point",
        "title": "Pilot an onboarding checklist",
        "preview": "Propose a short checklist experiment and compare activation before/after.",
        "why_now": "Team is discussing actionable retention interventions."
      },
      {
        "type": "fact_check",
        "title": "Validate churn attribution",
        "preview": "Check whether churn is product friction vs pricing/fit before deciding solution.",
        "why_now": "Current statements imply causation without supporting evidence."
      }
    ]
  }
}
```

### Error responses
- `400` invalid payload or API key missing
- `422` schema validation failure
- `502` model failure or malformed upstream output

### Frontend behavior
- In `useSuggestions.ts`:
  - auto-refresh roughly every 30 seconds while recording
  - manual refresh button calls same flow
  - prepend new batch to top of suggestion list
  - preserve older batches below
- In `SuggestionCard.tsx`:
  - clicking a card should push a `user` chat message then call `/api/chat`

## 6) Endpoint Contract: Chat (Streaming)

### Request
- Method: `POST`
- URL: `/api/chat`
- Content-Type: `application/json`
- Response type: `text/event-stream`

### Request Body

```json
{
  "api_key": "gsk_...",
  "user_message": "Give me a concise response I can say now",
  "transcript_chunks": [
    {
      "text": "Customer onboarding is where we lose users.",
      "timestamp": "2026-04-18T10:00:00.000000"
    }
  ],
  "chat_history": [
    {
      "role": "user",
      "content": "What should I ask next?",
      "timestamp": "2026-04-18T10:00:10.000000"
    },
    {
      "role": "assistant",
      "content": "Ask for the exact drop-off stage.",
      "timestamp": "2026-04-18T10:00:12.000000"
    }
  ],
  "settings": {
    "chat_prompt": "optional override",
    "expanded_context_window": 20,
    "suggestion_context_window": 12
  }
}
```

### Stream format (SSE)
Backend emits:

```txt
data: token fragment 1

data: token fragment 2

...

data: [DONE]

```

### Frontend streaming parser requirement
- Parse by SSE frames split on double newline (`\n\n`).
- For each frame starting with `data: `:
  - if payload is `[DONE]`, close stream
  - else append payload text to the current assistant message buffer

### Error responses
- `400` missing/invalid API key or invalid body
- `422` schema validation
- `502` model stream failure

### Frontend behavior
- In `useChat.ts`:
  - insert user message immediately
  - create optimistic assistant placeholder (`content: ""`)
  - append token chunks into assistant placeholder as they arrive
  - keep one continuous chat per in-memory session

## 7) Suggested frontend API wrapper signatures

Use these shapes in `frontend/lib/api.ts`.

```ts
export async function transcribeChunk(input: {
  apiKey: string;
  audioBlob: Blob;
  filename?: string;
  language?: string;
  prompt?: string;
}): Promise<{ text: string; timestamp: string }>;

export async function fetchSuggestions(input: {
  apiKey: string;
  transcriptChunks: TranscriptChunk[];
  settings: PromptSettings;
}): Promise<{ batch: SuggestionBatch }>;

export async function streamChatAnswer(input: {
  apiKey: string;
  userMessage: string;
  transcriptChunks: TranscriptChunk[];
  chatHistory: ChatMessage[];
  settings: PromptSettings;
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}): Promise<void>;
```

## 8) Recommended client-side defaults

Store these defaults in `SettingsModal.tsx` + `sessionStore.ts`:

```ts
export const DEFAULT_SETTINGS: PromptSettings = {
  suggestions_prompt: "",
  detailed_answer_prompt: "",
  chat_prompt: "",
  suggestion_context_window: 12,
  expanded_context_window: 20,
};
```

Notes:
- Empty prompt strings mean backend default prompts are used.
- If user edits prompts in settings, pass them through directly.

## 9) Export Contract (for `frontend/lib/export.ts`)

Recommended exported JSON shape:

```json
{
  "exported_at": "2026-04-18T11:00:00.000000",
  "session": {
    "transcript_chunks": [],
    "suggestion_batches": [],
    "chat_history": []
  },
  "settings_used": {
    "suggestion_context_window": 12,
    "expanded_context_window": 20
  }
}
```

Include timestamp fields for all transcript chunks, suggestion batches, and chat messages.

## 10) UX + Reliability Rules

- Disable mic/suggestion/chat actions until API key is present.
- Show clear inline errors for 4xx/5xx responses.
- Never drop existing transcript/history on failed refresh; keep previous state.
- Suggestions panel should still show older batches if newest call fails.
- Chat stream cancel should be supported on new outgoing user message.

## 11) CORS and Environment

- Backend currently allows all origins (`*`) for assignment convenience.
- Frontend should use `NEXT_PUBLIC_API_URL` (example: `http://127.0.0.1:8000`).
- Do not hardcode Groq key in source; always read from settings state and send per request.
