# Frontend Architecture - TwinMind UI

Last updated: 2026-04-19

## 1. Scope and Purpose

This document describes the current frontend architecture of the TwinMind UI and proposes a target architecture path.

The frontend is a single-page, client-heavy Next.js app that orchestrates a 3-panel live workflow:

1. Mic and transcript capture
2. Live suggestion batches
3. Streaming chat responses

It is optimized for low-latency interaction during a meeting and session-level continuity in one browser tab.

## 2. System Context

The UI depends on:

- Backend API service (default: http://127.0.0.1:8000)
- Browser microphone + AudioWorklet/VAD runtime
- Groq API key supplied by user in settings

The frontend does not persist data across page reloads. All runtime session data is held in memory via Zustand.

## 3. Tech Stack

- Framework: Next.js 16.2.4 (App Router)
- UI runtime: React 19.2.4
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS 4 + custom global classes/CSS variables
- Client state: Zustand 5
- Voice activity detection: @ricky0123/vad-web
- In-browser model runtime assets: onnxruntime-web artifacts copied to public/

## 4. High-Level Architecture

## 4.1 Logical Layers

- Presentation Layer
  - app/page.tsx (page orchestration)
  - components/* (panel and reusable UI components)
- Interaction Layer (hooks)
  - hooks/useMic.ts (audio/VAD/chunking/transcription upload)
  - hooks/useSuggestions.ts (polling + manual refresh)
  - hooks/useChat.ts (SSE chat stream management)
- State Layer
  - store/sessionStore.ts (single in-memory source of truth)
- Integration Layer
  - lib/api.ts (HTTP and SSE client wrappers)
  - lib/export.ts (JSON export generation and download)
- Domain Types
  - types/index.ts

## 4.2 Runtime Flow Summary

1. User configures API key and prompts in Settings modal.
2. User starts mic. VAD captures and chunks speech.
3. Chunks are sent to /api/transcribe. Transcript rows are appended/updated.
4. While recording, suggestions auto-refresh every 30s by calling /api/suggestions.
5. Each suggestion batch prepends to list (newest first), preserving history.
6. User clicks a suggestion or sends free text in chat.
7. Chat uses /api/chat SSE and streams tokens into last assistant message.
8. User can export transcript + suggestions + chat to JSON.

## 5. Current-State Module Inventory

## 5.1 App Shell and Global Styling

- app/layout.tsx
  - Registers Space Grotesk and IBM Plex Mono fonts.
  - Defines root metadata and full-height shell.
- app/globals.css
  - Defines custom CSS variables (background, foreground, surfaces).
  - Adds atmospheric radial-gradient background.
  - Defines shared utility classes: panel-base, panel-header, panel-title, panel-meta, panel-scroll, settings-field.
  - Responsive behavior for panel min heights on narrower layouts.
- app/page.tsx
  - Main composition root for 3-column layout.
  - Connects hooks, store selectors, settings modal, export action.
  - Performs backend health check on mount.
  - Controls API-key gating and panel-level disabled states.

## 5.2 State and Domain

- store/sessionStore.ts
  - Holds transcript, suggestion batches, chat history, recording state, and app settings.
  - Provides mutators:
    - appendTranscript
    - updateTranscriptById
    - prependSuggestionBatch
    - addChatMessage
    - appendToLastAssistantMessage
    - updateSettings
    - clearSession
  - Provides promptSettings() selector output used by API calls.
  - Seeds defaults from ENV and in-code prompt defaults.
- types/index.ts
  - Defines core entities: TranscriptChunk, Suggestion, SuggestionBatch, PromptSettings, AppSettings, ChatMessage, SessionExport.

## 5.3 Hooks (Interaction Layer)

- hooks/useMic.ts
  - Owns VAD lifecycle and microphone capture.
  - Maintains internal audio frame buffer with overlap-based sliding window logic.
  - Converts Float32 audio to WAV Blob and posts multipart form-data to /api/transcribe.
  - Merges overlapping transcript returns using string overlap detection.
  - Supports segment-level transcript row updates through appendTranscript/updateTranscriptById.
  - Exposes debug info snapshot for optional transcript diagnostics.

- hooks/useSuggestions.ts
  - Exposes refresh() for manual trigger.
  - Guards on missing API key and empty transcript.
  - Calls fetchSuggestions() and pushes result via onBatch callback.
  - Starts fixed 30-second polling while recording.
  - Tracks in-flight state and lastUpdatedAt.

- hooks/useChat.ts
  - Sends user message and optimistic empty assistant placeholder.
  - Cancels existing stream before starting a new one.
  - Streams SSE tokens from streamChatAnswer() into last assistant message.
  - Maintains isStreaming and error states.

## 5.4 API and Export

- lib/api.ts
  - healthCheck(): GET /health
  - transcribeChunk(): POST /api/transcribe (multipart)
  - fetchSuggestions(): POST /api/suggestions (JSON)
  - streamChatAnswer(): POST /api/chat (JSON request + SSE response parser)
  - parseError() normalizes backend error surface to Error objects.
- lib/export.ts
  - createSessionExport() composes export payload.
  - downloadSessionExport() creates Blob URL and triggers file download.

## 5.5 Presentation Components

- Transcript area
  - components/transcript/TranscriptPanel.tsx
  - components/transcript/TranscriptChunk.tsx
  - components/shared/MicButton.tsx
- Suggestions area
  - components/suggestions/SuggestionsPanel.tsx
  - components/suggestions/SuggestionBatch.tsx
  - components/suggestions/SuggestionCard.tsx
- Chat area
  - components/chat/ChatPanel.tsx
  - components/chat/ChatMessage.tsx
  - components/chat/ChatInput.tsx
- Shared/settings
  - components/shared/ExportButton.tsx
  - components/settings/SettingsModal.tsx

## 6. Data and State Flow Details

## 6.1 Transcript Path

- Source: microphone frames from VAD callbacks.
- Processing:
  - Buffered frames are chunked with overlap (5s window, 500ms overlap).
  - Near-silence chunks are filtered with RMS/peak thresholds.
- Sink:
  - /api/transcribe returns text.
  - Text delta merging prevents repeated text from overlap windows.
  - Store transcript row appended once and then updated by segment.

## 6.2 Suggestions Path

- Source: current transcript + prompt settings + API key.
- Trigger:
  - fixed interval timer while recording
  - manual reload action
- Sink:
  - /api/suggestions returns a batch with exactly 3 suggestions.
  - Batch prepended to suggestionBatches.

## 6.3 Chat Path

- Source:
  - user typed input or suggestion click-to-chat
  - current transcript + previous chat history + prompt settings
- Trigger:
  - ChatInput submit or suggestion click event.
- Sink:
  - /api/chat SSE stream.
  - Tokens append to last assistant message in store.
  - [DONE] or stream close marks completion.

## 7. UX and Interaction Contract

- API key is required before using mic, suggestions, or chat.
- Suggestion panel requires active recording for refresh actions from main page gating.
- Transcript, suggestions, and chat each surface dedicated error text.
- Scroll-to-bottom behavior exists in transcript and chat panels.
- Export is disabled if transcript + suggestion + chat lists are all empty.

## 8. Build and Runtime Asset Strategy

- next.config.ts copies model/runtime assets from dependencies into public/ at startup:
  - VAD artifacts from @ricky0123/vad-web/dist
  - ONNX runtime files from onnxruntime-web/dist
- This ensures runtime files are available at root paths expected by VAD config.
- ESLint ignores generated/copied public runtime assets.

## 9. Strengths of Current Architecture

- Clear separation between UI components, hooks, store, and API layer.
- Good single-session UX for live meeting support.
- Streaming chat implementation is straightforward and robust to aborts.
- Transcript merge strategy addresses overlap duplication from chunking.
- Modular component structure is easy to evolve.

## 10. Current Constraints and Risks

- No persistence across reload/navigation beyond in-memory session.
- Suggestions poll interval is hardcoded in hook (30s) even though settings has refresh_interval_seconds.
- Many selector subscriptions in app/page.tsx can trigger broad rerender pressure.
- Chat history snapshot for request is taken before appending latest user/assistant placeholders, which can diverge from intended server context semantics.
- No request retry/backoff strategy for flaky networks.
- No test coverage directory detected for hook/store/API logic.
- API key is stored in client state and passed directly from browser; acceptable for assignment scope but not ideal for hardened deployments.

## 11. Current vs Target Architecture

## 11.1 Current State

- Single-page orchestrator with direct hook wiring in app/page.tsx.
- Single global Zustand store for all domains.
- Polling and stream behavior managed entirely in custom hooks.
- Session export as direct client-generated JSON.

## 11.2 Target State

- Keep current simple architecture, but split into domain slices and add reliability boundaries.
- Introduce stronger state selectors and derived hooks to reduce top-level rerenders.
- Make settings-driven refresh cadence truly dynamic.
- Add persistence options and richer observability for production readiness.

## 11.3 Add / Change / Delete Inventory by Module

Add:

- hooks/useSessionPersistence.ts
  - Optional localStorage snapshot/restore for transcript/suggestions/chat/settings.
- hooks/useHealthStatus.ts
  - Isolate backend health lifecycle and retries.
- store/selectors.ts
  - Memoized selectors and per-panel selectors.
- lib/retry.ts
  - Reusable exponential backoff for non-stream requests.
- __tests__/ (or equivalent)
  - Hook unit tests for useMic chunk logic, useSuggestions interval behavior, and useChat stream transitions.

Change:

- hooks/useSuggestions.ts
  - Replace hardcoded 30s with settings.refresh_interval_seconds.
  - Optionally stagger immediate refresh on transcript growth milestones.
- app/page.tsx
  - Move feature wiring to per-panel containers to reduce orchestration complexity.
- store/sessionStore.ts
  - Split state into transcript slice, suggestions slice, chat slice, and settings slice.
  - Add selectors for panel-specific subscriptions.
- lib/api.ts
  - Add optional timeout wrappers and retry strategy for health/suggestions/transcribe.
- components/settings/SettingsModal.tsx
  - Validation and helper text for numeric fields and prompt length.

Delete or deprecate:

- Direct broad store access pattern from app/page.tsx over time, replaced by panel-level container hooks.
- Any unused settings fields once backend contract is finalized (for example detailed_answer_prompt if never consumed).

## 12. Recommended Migration Phases

Phase 1: Stability and low-risk improvements

- Wire refresh_interval_seconds into suggestions polling.
- Add retry/backoff for health and suggestions.
- Improve validation and error messaging in settings modal.

Phase 2: State and rendering optimization

- Introduce selector utilities and split store slices.
- Refactor app/page.tsx into small panel containers.

Phase 3: Persistence and quality

- Add optional local persistence and restore UX.
- Add unit tests for chunking, polling, and stream parser behavior.

Phase 4: Production hardening

- Add instrumentation events (request latency, stream failures).
- Tighten security posture and secret handling strategy.

## 13. Suggested Operational Metrics

- Transcribe success rate and median latency
- Suggestions refresh success rate and latency
- Chat stream completion rate vs abort/error rate
- Average transcript chunks per session
- Average suggestion clicks per session

## 14. File Map (Reference)

Core orchestrator:

- app/page.tsx

State and domain:

- store/sessionStore.ts
- types/index.ts

Hooks:

- hooks/useMic.ts
- hooks/useSuggestions.ts
- hooks/useChat.ts

Integrations:

- lib/api.ts
- lib/export.ts

Panels and controls:

- components/transcript/TranscriptPanel.tsx
- components/transcript/TranscriptChunk.tsx
- components/suggestions/SuggestionsPanel.tsx
- components/suggestions/SuggestionBatch.tsx
- components/suggestions/SuggestionCard.tsx
- components/chat/ChatPanel.tsx
- components/chat/ChatMessage.tsx
- components/chat/ChatInput.tsx
- components/settings/SettingsModal.tsx
- components/shared/MicButton.tsx
- components/shared/ExportButton.tsx

Infra/config:

- next.config.ts
- app/globals.css
- package.json
- eslint.config.mjs

## 15. Conclusion

The frontend is already organized around a clean layered model and is well-suited for the assignment's live-copilot workflow. The strongest next improvements are settings-driven polling, state subscription optimization, and reliability testing around audio chunking and SSE streaming.
