import type { SessionExport } from "@/types";
import type { useSessionStore } from "@/store/sessionStore";

type SessionSnapshot = ReturnType<typeof useSessionStore.getState>;

export function createSessionExport(state: SessionSnapshot): SessionExport {
  return {
    exported_at: new Date().toISOString(),
    session: {
      transcript_chunks: state.transcript,
      suggestion_batches: state.suggestionBatches,
      chat_history: state.chatHistory,
    },
    settings_used: {
      suggestion_context_window: state.settings.suggestion_context_window,
      expanded_context_window: state.settings.expanded_context_window,
    },
  };
}

export function downloadSessionExport(state: SessionSnapshot): void {
  const payload = createSessionExport(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `twinmind-session-${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
