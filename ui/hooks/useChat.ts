"use client";

import { useCallback, useRef, useState } from "react";

import { streamChatAnswer } from "@/lib/api";
import {
  makeAssistantMessage,
  makeUserMessage,
  useSessionStore,
} from "@/store/sessionStore";

export function useChat() {
  const apiKey = useSessionStore((state) => state.settings.api_key);
  const transcript = useSessionStore((state) => state.transcript);
  const promptSettings = useSessionStore((state) => state.promptSettings);
  const addChatMessage = useSessionStore((state) => state.addChatMessage);
  const appendToLastAssistantMessage = useSessionStore(
    (state) => state.appendToLastAssistantMessage,
  );

  const abortRef = useRef<AbortController | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelActiveStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message) {
        return;
      }

      if (!apiKey) {
        setError("Add your API key in Settings before using chat.");
        return;
      }

      cancelActiveStream();
      setError(null);

      const chatHistory = useSessionStore.getState().chatHistory;
      addChatMessage(makeUserMessage(message));
      addChatMessage(makeAssistantMessage(""));

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      await streamChatAnswer({
        apiKey,
        userMessage: message,
        transcriptChunks: transcript,
        chatHistory,
        settings: promptSettings(),
        signal: controller.signal,
        onToken: (token) => {
          appendToLastAssistantMessage(token);
        },
        onDone: () => {
          setIsStreaming(false);
          abortRef.current = null;
        },
        onError: (err) => {
          setIsStreaming(false);
          abortRef.current = null;
          setError(err.message);
        },
      });
    },
    [
      addChatMessage,
      apiKey,
      appendToLastAssistantMessage,
      cancelActiveStream,
      promptSettings,
      transcript,
    ],
  );

  return {
    sendMessage,
    cancelActiveStream,
    isStreaming,
    error,
  };
}
