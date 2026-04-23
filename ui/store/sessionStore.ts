import { create } from "zustand";

import type {
  AppSettings,
  ChatMessage,
  PromptSettings,
  SuggestionBatch,
  TranscriptChunk,
} from "@/types";

const nowIso = () => new Date().toISOString();
const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const ENV_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY ?? "";

export const DEFAULT_SETTINGS: AppSettings = {
  api_key: ENV_API_KEY,
  transcribe_language: "en",
  transcribe_prompt:
    "Transcribe spoken English clearly with punctuation. Keep filler words only when meaningful.",
  suggestions_prompt:
    "You are a live meeting copilot. Return exactly 3 actionable suggestions based on the latest transcript context. Prefer concise, practical outputs.",
  detailed_answer_prompt:
    "Provide a structured, accurate, and concise answer with key points first, then brief supporting details.",
  chat_prompt:
    "You are an assistant grounded in the meeting transcript. Answer clearly, cite relevant context implicitly, and avoid inventing facts.",
  suggestion_context_window: 12,
  expanded_context_window: 20,
  refresh_interval_seconds: 30,
};

interface SessionState {
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatHistory: ChatMessage[];
  isRecording: boolean;
  settings: AppSettings;
  appendTranscript: (text: string, timestamp?: string) => string | null;
  updateTranscriptById: (id: string, text: string) => void;
  appendSuggestionBatch: (batch: SuggestionBatch) => void;
  addChatMessage: (message: ChatMessage) => void;
  appendToLastAssistantMessage: (token: string) => void;
  setRecording: (isRecording: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  promptSettings: () => PromptSettings;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  transcript: [],
  suggestionBatches: [],
  chatHistory: [],
  isRecording: false,
  settings: DEFAULT_SETTINGS,
  appendTranscript: (text, timestamp) => {
    if (!text?.trim()) {
      return null;
    }

    const id = makeId();

    set((state) => ({
      transcript: [
        ...state.transcript,
        {
          id,
          text,
          timestamp: timestamp ?? nowIso(),
        },
      ],
    }));

    return id;
  },
  updateTranscriptById: (id, text) => {
    if (!text?.trim()) {
      return;
    }

    set((state) => {
      const chunkIndex = state.transcript.findIndex((chunk) => chunk.id === id);
      if (chunkIndex < 0) {
        return state;
      }

      const next = [...state.transcript];
      next[chunkIndex] = {
        ...next[chunkIndex],
        text,
      };

      return {
        transcript: next,
      };
    });
  },
  appendSuggestionBatch: (batch) => {
    set((state) => ({
      suggestionBatches: [...state.suggestionBatches, batch],
    }));
  },
  addChatMessage: (message) => {
    set((state) => ({
      chatHistory: [...state.chatHistory, message],
    }));
  },
  appendToLastAssistantMessage: (token) => {
    if (!token) {
      return;
    }

    set((state) => {
      const next = [...state.chatHistory];

      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i]?.role === "assistant") {
          next[i] = {
            ...next[i],
            content: `${next[i].content}${token}`,
          };
          break;
        }
      }

      return { chatHistory: next };
    });
  },
  setRecording: (isRecording) => {
    set({ isRecording });
  },
  updateSettings: (patch) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ...patch,
      },
    }));
  },
  promptSettings: () => {
    const settings = get().settings;
    return {
      suggestions_prompt: settings.suggestions_prompt,
      detailed_answer_prompt: settings.detailed_answer_prompt,
      chat_prompt: settings.chat_prompt,
      suggestion_context_window: settings.suggestion_context_window,
      expanded_context_window: settings.expanded_context_window,
    };
  },
  clearSession: () => {
    set((state) => ({
      transcript: [],
      suggestionBatches: [],
      chatHistory: [],
      isRecording: false,
      settings: {
        ...state.settings,
      },
    }));
  },
}));

export const makeUserMessage = (content: string): ChatMessage => ({
  role: "user",
  content,
  timestamp: nowIso(),
});

export const makeAssistantMessage = (content = ""): ChatMessage => ({
  role: "assistant",
  content,
  timestamp: nowIso(),
});
