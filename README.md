# INSIGHT-FLOW

> **Note:** On the deployed website, the backend may take up to ~50 seconds on the first request. It is hosted on Render, and the service can go to sleep after inactivity (cold start behavior).

Insight is a meeting copilot with:

- a Next.js frontend (`ui`) for microphone capture, live transcript, suggestion cards, and chat
- a FastAPI backend (`backend`) for transcription, suggestion generation, and streaming chat responses

## 1) Run Locally

### Prerequisites

- Node.js 20+ and npm
- Python 3.10+
- A Groq API key (you will paste this in the app Settings)

### Clone

```bash
git clone <your-repo-url>
cd second_brain
```

### Start Backend (Python + `requirements.txt`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a backend env file:

```bash
cp .env.example .env 2>/dev/null || true
```

If `.env.example` is not present, create `.env` manually with:

```bash
FRONTEND_URL=http://localhost:3000
```

Run backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend health check:

```bash
curl http://localhost:8000/health
```

### Start Frontend (Next.js)

Open another terminal:

```bash
cd ui
npm install
```

Create `ui/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Run frontend:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then add your Groq API key in Settings.

---

## 2) Three-Part Pipeline (High-Level)

### A) Transcription pipeline

1. Frontend mic capture uses VAD (voice activity detection) to listen for speech.
2. Audio is processed in rolling windows and sent to `POST /api/transcribe`.
3. Backend forwards audio to Groq transcription and returns text.
4. Frontend appends/updates transcript rows in near real time.

### B) 5-second chunking logic (to keep it realistic)

The mic flow uses:

- `5s` chunk windows
- about `0.5s` overlap between windows
- frequent flush checks (every ~250ms)

Why this helps:

- overlap avoids cutting words at boundaries
- 5-second windows keep latency low while still providing enough context
- near-silence chunks are skipped to reduce noisy calls

### C) Suggestions + context + chat message flow

1. Frontend sends transcript chunks to `POST /api/suggestions`.
2. Backend builds context from recent transcript plus lightweight session memory (summary/follow-up state).
3. Backend returns exactly 3 suggestion cards for the current moment.
4. When user chats, frontend sends:
   - latest user message
   - transcript context window
   - recent chat history
5. Backend streams the answer back via SSE from `POST /api/chat`, so UI updates token-by-token.

---

## 3) Project Layout

- `backend/app/main.py`: FastAPI app + routers
- `backend/app/routers/transcribe.py`: transcription endpoint
- `backend/app/routers/suggestions.py`: suggestion generation endpoint
- `backend/app/routers/chat.py`: SSE chat endpoint
- `ui/app/page.tsx`: main app shell and orchestration
- `ui/hooks/useMic.ts`: live audio capture + 5s chunk logic
- `ui/lib/api.ts`: frontend API calls

## Notes

- CORS is controlled by `FRONTEND_URL` on backend.
- Frontend API base URL is controlled by `NEXT_PUBLIC_API_URL`.
- Current in-browser session state is designed for live usage and quick export, not long-term persistence.
