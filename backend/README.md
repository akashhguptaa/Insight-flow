# TwinMind Backend (FastAPI)

Backend API for live mic transcription, live suggestions, and chat answers.

## Stack
- FastAPI
- Groq SDK
- Whisper Large V3 (`whisper-large-v3`) for transcription
- GPT-OSS 120B (`openai/gpt-oss-120b`) for suggestions and chat

## Run Locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API will run at `http://127.0.0.1:8000`.

## Environment

Copy `.env.example` to `.env` if you want a local fallback key:

```bash
cp .env.example .env
```

Most flows should pass the Groq key from frontend in each request body/form.

## Endpoints

### `GET /health`
Simple health check.

### `POST /api/transcribe`
Multipart form-data:
- `audio`: audio file chunk
- `api_key`: Groq API key
- `language` (optional)
- `prompt` (optional)

Returns:

```json
{
  "text": "transcribed text",
  "timestamp": "2026-04-18T10:00:00.000000"
}
```

### `POST /api/suggestions`
JSON body:

```json
{
  "api_key": "gsk_...",
  "transcript_chunks": [
    { "text": "We should reduce churn by onboarding improvements", "timestamp": "2026-04-18T10:00:00.000000" }
  ],
  "settings": {
    "suggestion_context_window": 12,
    "suggestions_prompt": "optional override"
  }
}
```

Returns exactly 3 suggestions:

```json
{
  "batch": {
    "created_at": "2026-04-18T10:00:00.000000",
    "suggestions": [
      {
        "type": "question_to_ask",
        "title": "How will we measure onboarding impact?",
        "preview": "Ask for activation and week-1 retention metrics before committing rollout.",
        "why_now": "Team is discussing churn reduction strategy."
      }
    ]
  }
}
```

### `POST /api/chat`
JSON body:

```json
{
  "api_key": "gsk_...",
  "user_message": "Give me a concise response I can say now",
  "transcript_chunks": [],
  "chat_history": [],
  "settings": {
    "expanded_context_window": 20,
    "chat_prompt": "optional override"
  }
}
```

Returns `text/event-stream` (SSE) with incremental answer chunks and a `[DONE]` marker.

## Prompt Strategy
- Live suggestions prompt enforces strict JSON and exactly 3 diverse, immediately useful cards.
- Chat prompt emphasizes grounded and practical answers with explicit assumptions when context is missing.
- Frontend can override prompt text and context windows at runtime for experimentation.

## Notes
- Backend is stateless by design. Frontend sends transcript/chat context each call.
- CORS is open for assignment convenience; lock down origins before production use.
