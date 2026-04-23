# TwinMind Backend Architecture (Current State)

## 1) Purpose and Scope
This backend is a stateless FastAPI service that provides three realtime capabilities for a meeting-assistant product:
- Audio chunk transcription
- Live suggestion generation
- Streaming chat answers

The system is intentionally thin and orchestration-focused: it validates incoming payloads, builds prompt/context, calls Groq models, normalizes outputs, and returns frontend-friendly responses.

## 2) Directory-Level Architecture

### Root-level files
- `README.md`: quick setup, endpoint overview, and runtime model notes.
- `FRONTEND_INTEGRATION_CONTRACT.md`: canonical request/response contract expected by frontend clients.
- `suggestion_ui.md`: frontend behavior contract specifically for suggestions fetch cadence and payload shape.
- `planner.md`: original implementation plan and decisions used to build this backend.
- `requirements.txt`: pinned dependencies for API framework, validation, HTTP, and Groq SDK.
- `.env.example`: optional fallback env var (`GROQ_API_KEY`) if request-level key is not sent.
- `.gitignore`: currently ignores `.env` and `env`.

### Application package (`app/`)
- `app/main.py`: FastAPI app initialization, CORS policy, health endpoint, and router registration.
- `app/models/schemas.py`: all Pydantic contracts and validation rules.
- `app/routers/transcribe.py`: multipart audio ingestion endpoint.
- `app/routers/suggestions.py`: live suggestions endpoint.
- `app/routers/chat.py`: streaming chat endpoint (SSE).
- `app/services/groq_client.py`: API key resolution, model constants, and transcription upstream call.
- `app/services/suggestion_engine.py`: prompt/context building, model invocation, parsing, and normalization for suggestions.
- `app/services/chat_engine.py`: context assembly and SSE streaming chat completion.
- `app/prompts/suggestions_prompt.py`: strict JSON behavior contract for suggestion generation.
- `app/prompts/chat_prompt.py`: grounding and response-style behavior for chat answers.
- `__init__.py` files across packages are present but empty (package markers).

### Runtime/Environment folders
- `env/`: local virtual environment (not part of application architecture).
- `__pycache__/`: compiled Python artifacts (generated, non-source).

## 3) Layered Design

### Layer A: API Surface (Routers)
Responsibilities:
- Accept HTTP payloads
- Perform endpoint-specific lightweight checks
- Delegate business logic to services
- Return typed responses or stream output

Endpoints:
- `GET /health`
- `POST /api/transcribe`
- `POST /api/suggestions`
- `POST /api/chat` (SSE)

### Layer B: Domain Contracts (Schemas)
`app/models/schemas.py` defines all request and response payloads.

Important validations:
- `SuggestionBatch.suggestions` must have exactly 3 items.
- `PromptSettings` includes bounded windows:
  - `suggestion_context_window`: 3..80 (default 12)
  - `expanded_context_window`: 5..120 (default 20)
- `api_key` requires minimum length for both suggestion/chat requests.
- Text fields have practical max lengths to cap payload sizes.

### Layer C: Prompt and Context Assembly
- Prompt defaults are centralized in `app/prompts`.
- Frontend can override default prompts at request time through `settings`.
- Transcript context uses a recency window from request settings and formats lines with optional speaker labels.

### Layer D: External Model Integration
- `app/services/groq_client.py` handles:
  - API key resolution (request key first, env fallback second)
  - Groq client construction
  - direct async transcription upload using `httpx`
- `app/services/suggestion_engine.py` and `app/services/chat_engine.py` call chat completions via Groq SDK.

## 4) Request Flows

### 4.1 Transcription flow (`POST /api/transcribe`)
1. Router receives `multipart/form-data` (`audio`, `api_key`, optional `language`, `prompt`).
2. Router checks filename exists and reads uploaded bytes.
3. Service validates non-empty audio and resolves API key.
4. Service sends audio to Groq transcription endpoint with:
   - model: `whisper-large-v3-turbo`
   - response format: text
   - language default fallback: `en`
   - temperature: `0`
5. Raw text response is trimmed and returned as `TranscribeResponse`.

Failure handling:
- Empty upload or invalid data -> `400`
- Upstream 4xx is preserved when appropriate
- Other upstream/service failures map to `502`

### 4.2 Suggestions flow (`POST /api/suggestions`)
1. Router receives JSON `SuggestionRequest`.
2. Service slices recent transcript by `suggestion_context_window`.
3. Service chooses prompt:
   - `settings.suggestions_prompt` if provided
   - otherwise `DEFAULT_SUGGESTIONS_SYSTEM_PROMPT`
4. Service calls Groq chat completion with:
   - model: `openai/gpt-oss-20b`
   - `response_format={"type":"json_object"}`
5. Output parser extracts JSON (supports raw JSON or JSON embedded in text).
6. Normalizer:
   - validates types against allowed set
   - trims text lengths
   - fills missing/invalid fields with safe defaults
   - enforces exactly 3 suggestions with fallback suggestions if needed
7. Router returns `SuggestionResponse`.

Failure handling:
- API-level upstream errors mapped with detail
- connectivity/timeouts mapped to `502`
- invalid model JSON falls back to deterministic suggestions instead of hard failure

### 4.3 Chat flow (`POST /api/chat`, SSE)
1. Router receives JSON `ChatRequest`.
2. Service builds:
   - transcript context from recent chunks (`expanded_context_window`)
   - summarized recent chat history (last 12 messages)
   - effective system prompt (override or default)
3. Service starts streaming completion with Groq SDK:
   - model: `openai/gpt-oss-20b`
   - stream: true
4. Service yields SSE frames as:
   - `data: <token>\n\n`
   - terminal marker: `data: [DONE]\n\n`
5. Router returns `StreamingResponse` with no-cache/keep-alive headers.

Failure handling:
- service wraps unexpected stream failures into `502`

## 5) Data Model Summary

### Core entities
- `TranscriptChunk`: text + timestamp + optional speaker.
- `Suggestion`: `type`, `title`, `preview`, `why_now`.
- `SuggestionBatch`: created timestamp + exactly 3 suggestions.
- `ChatMessage`: role/content/timestamp.
- `PromptSettings`: runtime tuning knobs for prompt overrides and context windows.

### Contract consistency notes
- `FRONTEND_INTEGRATION_CONTRACT.md` documents text model as `openai/gpt-oss-120b`.
- Current runtime code uses `TEXT_MODEL = "openai/gpt-oss-20b"`.
- This is a doc-code mismatch to resolve when aligning performance/cost/quality expectations.

## 6) Configuration and Runtime Behavior

### API key strategy
Order of precedence:
1. Request payload/form `api_key`
2. `GROQ_API_KEY` from environment

If neither is available, service returns a clear `400` error.

### CORS
- Current policy allows all origins, methods, and headers.
- Good for local integration; unsafe as-is for production.

### Statelessness
- Backend stores no meeting/session state.
- Frontend must send transcript chunks and chat history on each call.
- Horizontal scaling remains simple because no sticky session is required.

## 7) Error and Resilience Design

### Strengths
- Centralized API-key validation.
- Upstream status/detail propagation where possible.
- Suggestions endpoint degrades gracefully with fallback suggestions.
- Streaming endpoint emits explicit completion marker (`[DONE]`).

### Current gaps
- No structured request logging or correlation IDs.
- No retry/backoff policy for upstream transient failures.
- No auth/rate limiting beyond API key presence.
- No persistent metrics/tracing integration.

## 8) Security and Production Readiness Notes

Current state:
- Keys are user-provided and can fallback from env.
- Open CORS and no app-level auth/tenant isolation.
- No payload size limits configured at app ingress level.

Before production:
- Restrict CORS origins.
- Add auth and per-user quota/rate limiting.
- Add request IDs, audit-safe logs, and alerting.
- Consider content moderation and abuse handling policy.

## 9) Dependencies and Their Role
- `fastapi`, `starlette`: HTTP API and streaming responses.
- `pydantic`: request/response typing and validation.
- `groq`: chat completion SDK integration.
- `httpx`: async multipart transcription call.
- `python-multipart`: required for file upload handling.
- `python-dotenv`: optional env loading support.

## 10) Current Architecture Assessment

What is strong now:
- Clean separation between routers, services, prompts, and schemas.
- Good contract-first shape for frontend integration.
- Recency-window context strategy keeps token usage bounded.
- Suggestions normalization prevents malformed UI payloads.

What should be improved next:
- Align documented models vs implemented models.
- Add automated tests for schema boundaries and endpoint behavior.
- Add structured observability (logs/metrics/traces).
- Add stricter production security controls.

## 11) Quick File-to-Responsibility Map
- `app/main.py`: app composition and middleware.
- `app/models/schemas.py`: all typed contracts and invariants.
- `app/routers/transcribe.py`: upload endpoint orchestration.
- `app/routers/suggestions.py`: suggestions endpoint orchestration.
- `app/routers/chat.py`: SSE endpoint orchestration.
- `app/services/groq_client.py`: key resolution + transcription transport.
- `app/services/suggestion_engine.py`: suggestion generation and hardening.
- `app/services/chat_engine.py`: chat context shaping and token streaming.
- `app/prompts/suggestions_prompt.py`: strict JSON output steering.
- `app/prompts/chat_prompt.py`: grounded chat behavior steering.

## 12) Summary
The backend is a modular, stateless FastAPI orchestration service around Groq models. Its current architecture is well-suited for rapid frontend integration and iterative prompt tuning, with clear separation of concerns and deterministic output shaping for suggestions. The next maturity step is production hardening: security constraints, observability, tests, and model-contract alignment.
