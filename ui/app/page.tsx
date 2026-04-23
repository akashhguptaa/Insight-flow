"use client";

import { useEffect, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { ExportButton } from "@/components/shared/ExportButton";
import { SuggestionsPanel } from "@/components/suggestions/SuggestionsPanel";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { useChat } from "@/hooks/useChat";
import { useMic } from "@/hooks/useMic";
import { useSuggestions } from "@/hooks/useSuggestions";
import { healthCheck } from "@/lib/api";
import { downloadSessionExport } from "@/lib/export";
import { useSessionStore } from "@/store/sessionStore";
import type { AppSettings, Suggestion } from "@/types";

export default function Home() {
  const showTranscriptDebug =
    process.env.NEXT_PUBLIC_SHOW_TRANSCRIPT_DEBUG === "1";

  const transcript = useSessionStore((state) => state.transcript);
  const suggestionBatches = useSessionStore((state) => state.suggestionBatches);
  const chatHistory = useSessionStore((state) => state.chatHistory);
  const settings = useSessionStore((state) => state.settings);
  const appendTranscript = useSessionStore((state) => state.appendTranscript);
  const updateTranscriptById = useSessionStore(
    (state) => state.updateTranscriptById,
  );
  const appendSuggestionBatch = useSessionStore(
    (state) => state.appendSuggestionBatch,
  );
  const updateSettings = useSessionStore((state) => state.updateSettings);
  const setRecording = useSessionStore((state) => state.setRecording);
  const promptSettings = useSessionStore((state) => state.promptSettings);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<
    "idle" | "ok" | "error" | "checking"
  >("idle");

  const mic = useMic({
    apiKey: settings.api_key,
    language: settings.transcribe_language,
    prompt: settings.transcribe_prompt,
    appendTranscript,
    updateTranscriptById,
  });

  const suggestions = useSuggestions({
    apiKey: settings.api_key,
    transcript,
    settings: promptSettings(),
    isRecording: mic.isRecording,
    onBatch: appendSuggestionBatch,
  });

  const chat = useChat();

  useEffect(() => {
    setRecording(mic.isRecording);
  }, [mic.isRecording, setRecording]);

  useEffect(() => {
    let cancelled = false;

    const runHealth = async () => {
      setHealthStatus("checking");
      try {
        await healthCheck();
        if (!cancelled) {
          setHealthStatus("ok");
        }
      } catch {
        if (!cancelled) {
          setHealthStatus("error");
        }
      }
    };

    void runHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleManualRefresh = async () => {
    await suggestions.refresh();
  };

  const handleSuggestionClick = async (suggestion: Suggestion) => {
    await chat.sendMessage(`${suggestion.title}\n\n${suggestion.preview}`);
  };

  const hasApiKey = Boolean(settings.api_key.trim());
  const sharedDisabled = !hasApiKey;

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950/92 px-4 backdrop-blur-md">
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          <h1 className="truncate text-base font-semibold tracking-tight text-slate-50">
            TwinMind Live Suggestions
          </h1>
          {!hasApiKey ? (
            <p className="truncate text-[11px] text-amber-200/90">
              Add your Groq API key in Settings to enable capture, suggestions, and
              chat.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="rounded border border-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Backend: {healthStatus}
          </span>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
          >
            Settings
          </button>
          <ExportButton
            onClick={() => downloadSessionExport(useSessionStore.getState())}
            disabled={
              transcript.length + suggestionBatches.length + chatHistory.length ===
              0
            }
          />
        </div>
      </header>

      <main className="grid min-h-0 min-w-0 flex-1 grid-cols-3">
        <TranscriptPanel
          transcript={transcript}
          isRecording={mic.isRecording}
          isListening={mic.isListening}
          error={mic.error}
          debugInfo={showTranscriptDebug ? mic.debugInfo : undefined}
          onToggleMic={() => {
            if (mic.isRecording) {
              mic.stopMic();
              return;
            }

            void mic.startMic().catch((error) => {
              console.error("[mic] Failed to toggle microphone", error);
            });
          }}
          disabled={sharedDisabled}
        />

        <SuggestionsPanel
          batches={suggestionBatches}
          isRefreshing={suggestions.isRefreshing}
          error={suggestions.error}
          lastUpdatedAt={suggestions.lastUpdatedAt}
          refreshIntervalSeconds={settings.refresh_interval_seconds}
          onRefresh={() => {
            void handleManualRefresh();
          }}
          onClickSuggestion={(item) => {
            void handleSuggestionClick(item);
          }}
          disabled={sharedDisabled || !mic.isRecording}
        />

        <ChatPanel
          messages={chatHistory}
          isStreaming={chat.isStreaming}
          error={chat.error}
          onSend={chat.sendMessage}
          disabled={sharedDisabled}
        />
      </main>

      <SettingsModal
        key={isSettingsOpen ? "settings-open" : "settings-closed"}
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(next: AppSettings) => updateSettings(next)}
      />
    </div>
  );
}
