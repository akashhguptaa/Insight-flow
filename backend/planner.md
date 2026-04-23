# TwinMind Timed Context Planner

## Goal
Implement the timed suggestion + summary context pipeline for live sessions so suggestions stay fresh but token usage stays bounded.

## Current State
- Suggestions refresh every 30 seconds while recording.
- Suggestion context currently uses only recent transcript chunks.
- No 75-second summary checkpoint exists.
- No backend session state exists for follow-up history and rolling context strategy.

## Target State
- First suggestions run 30 seconds after recording starts.
- Suggestions keep refreshing every 30 seconds and include previous follow-up context.
- Every 75 seconds from speech start, backend generates a structured summary.
- After first summary, suggestion context becomes: summary + last 20 transcript chunks + previous follow-ups.
- At each subsequent 75-second checkpoint, summary is updated using prior summary + new transcript window.
- UI shows context as "cached" without exposing internal summary mechanics.

## Add / Change / Delete Inventory

### Add
- `backend/app/utils/state.py`
- `backend/app/utils/generate_summary.py`

### Change
- `backend/app/services/suggestion_engine.py`
- `backend/app/models/schemas.py`
- `ui/lib/api.ts`
- `ui/hooks/useSuggestions.ts`
- `ui/components/suggestions/SuggestionsPanel.tsx`

### Delete
- None

## Five-Step Execution

1. Step 1: 30s delayed first suggestion after recording start
- Status: Completed
- Notes: Existing frontend interval already starts first request at +30s from recording state transition.

2. Step 2: Every 30s suggestions refresh with follow-up continuity
- Status: In progress
- Notes: Backend state will persist previous suggestion cards per session and include them in prompt context.

3. Step 3: Summary generation every 75s from speech start
- Status: In progress
- Notes: Implemented as checkpoint-driven background behavior on suggestion calls (cron-like cadence without a separate scheduler process).

4. Step 4: Context switching rules
- Status: In progress
- Notes:
  - Before first summary: transcript + previous follow-ups.
  - After first summary: summary + last 20 transcript + previous follow-ups.
  - On each next 75s boundary: update summary and continue with same compacted context policy.

5. Step 5: UI cache messaging
- Status: Planned
- Notes: Suggestions panel will label the context as cached for the current session.
