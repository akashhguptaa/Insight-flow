# TwinMind Frontend (Live Suggestions Assignment)

Next.js frontend for a live meeting copilot with:

- live mic transcription (~30s chunk cadence)
- exactly 3 suggestion cards per refresh
- continuous session chat with streaming answers
- settings modal for API key + prompt/config tuning
- JSON export of transcript + suggestion batches + chat timeline

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Zustand (session state)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure backend URL in `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

3. Start frontend:

```bash
npm run dev
```

4. Open http://localhost:3000

5. In app Settings, paste your Groq API key.

## Project Structure

- `app/page.tsx`: Main orchestration for 3-column layout.
- `components/transcript/*`: Mic/transcript UI.
- `components/suggestions/*`: Suggestion list, batches, cards.
- `components/chat/*`: Chat timeline + input.
- `components/settings/SettingsModal.tsx`: API key + prompt settings.
- `hooks/useMic.ts`: Mic capture and transcription chunk uploads.
- `hooks/useSuggestions.ts`: polling + manual refresh flow.
- `hooks/useChat.ts`: chat stream state + cancel/replace behavior.
- `store/sessionStore.ts`: in-memory transcript/suggestions/chat/settings.
- `lib/api.ts`: backend API wrappers and SSE parser.
- `lib/export.ts`: session export generator/downloader.

## Prompt Strategy

Prompt quality is intentionally user-editable in Settings. The frontend passes:

- transcript chunk timeline
- chat history
- context window sizes
- prompt overrides for suggestion/chat behavior

Live suggestions use short-context windows for relevance and low latency.
Chat uses expanded context windows for fuller answers after click/direct questions.

## Reliability / UX Rules Implemented

- actions disabled until API key is present
- transcript, suggestions, and chat errors shown inline
- failed suggestion refresh does not clear previous batches
- one continuous chat per tab session (no persistence after reload)
- new outgoing chat cancels previous stream
- export includes timestamps for transcript chunks, suggestion batches, and chat history

## Tradeoffs

- In-memory state only: simple session model, no cross-reload persistence.
- Frontend-driven ~30s cadence: low complexity and predictable behavior.
- Manual refresh flushes recorder first, then requests suggestions.
- Optimized for assignment speed/readability rather than production hardening.
