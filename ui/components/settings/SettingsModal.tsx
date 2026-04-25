"use client";

import { useState } from "react";

import type { AppSettings } from "@/types";

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
  onSpinUpBackend: () => void;
  isSpinningBackend: boolean;
}

export function SettingsModal({
  isOpen,
  settings,
  onClose,
  onSave,
  onSpinUpBackend,
  isSpinningBackend,
}: SettingsModalProps) {
  const [local, setLocal] = useState<AppSettings>(settings);

  if (!isOpen) {
    return null;
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-[#0d1424] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-1 text-sm text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="settings-field md:col-span-2">
            Groq API Key
            <input
              type="password"
              value={local.api_key}
              onChange={(event) => update("api_key", event.target.value)}
              placeholder="gsk_..."
            />
          </label>

          <label className="settings-field">
            Transcribe Language
            <input
              value={local.transcribe_language ?? ""}
              onChange={(event) =>
                update("transcribe_language", event.target.value)
              }
              placeholder="en"
            />
          </label>

          <label className="settings-field">
            Refresh Interval (seconds)
            <input
              type="number"
              min={10}
              max={120}
              value={local.refresh_interval_seconds}
              onChange={(event) =>
                update("refresh_interval_seconds", Number(event.target.value) || 30)
              }
            />
          </label>

          <label className="settings-field md:col-span-2">
            Transcribe Prompt
            <textarea
              rows={3}
              value={local.transcribe_prompt ?? ""}
              onChange={(event) => update("transcribe_prompt", event.target.value)}
              placeholder="Optional Whisper guidance"
            />
          </label>

          <label className="settings-field md:col-span-2">
            Live Suggestions Prompt
            <textarea
              rows={5}
              value={local.suggestions_prompt ?? ""}
              onChange={(event) => update("suggestions_prompt", event.target.value)}
            />
          </label>

          <label className="settings-field md:col-span-2">
            Detailed Answer Prompt (reserved)
            <textarea
              rows={4}
              value={local.detailed_answer_prompt ?? ""}
              onChange={(event) =>
                update("detailed_answer_prompt", event.target.value)
              }
            />
          </label>

          <label className="settings-field md:col-span-2">
            Chat Prompt
            <textarea
              rows={5}
              value={local.chat_prompt ?? ""}
              onChange={(event) => update("chat_prompt", event.target.value)}
            />
          </label>

          <label className="settings-field">
            Suggestion Context Window
            <input
              type="number"
              min={4}
              max={100}
              value={local.suggestion_context_window}
              onChange={(event) =>
                update("suggestion_context_window", Number(event.target.value) || 12)
              }
            />
          </label>

          <label className="settings-field">
            Expanded Context Window
            <input
              type="number"
              min={4}
              max={200}
              value={local.expanded_context_window}
              onChange={(event) =>
                update("expanded_context_window", Number(event.target.value) || 20)
              }
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSpinUpBackend}
            disabled={isSpinningBackend}
            className="rounded-md border border-emerald-300/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSpinningBackend ? "Spinning backend..." : "Spin Up Backend"}
          </button>

          <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(local);
              onClose();
            }}
            className="rounded-md border border-sky-300/30 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100"
          >
            Save settings
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
