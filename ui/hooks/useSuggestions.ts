"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSuggestions } from "@/lib/api";
import type { PromptSettings, SuggestionBatch, TranscriptChunk } from "@/types";

interface UseSuggestionsOptions {
  apiKey: string;
  transcript: TranscriptChunk[];
  settings: PromptSettings;
  isRecording: boolean;
  onBatch: (batch: SuggestionBatch) => void;
}

export function useSuggestions(options: UseSuggestionsOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const latestOptionsRef = useRef(options);
  const sessionIdRef = useRef(
    `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  const refresh = useCallback(async (input?: { silentWhenEmpty?: boolean }) => {
    const current = latestOptionsRef.current;

    if (inFlightRef.current) {
      return;
    }

    if (!current.apiKey) {
      setError("Add your API key in Settings to fetch suggestions.");
      return;
    }

    if (current.transcript.length === 0) {
      if (!input?.silentWhenEmpty) {
        setError("Start recording to generate suggestions.");
      }
      return;
    }

    try {
      inFlightRef.current = true;
      setError(null);
      setIsRefreshing(true);

      const result = await fetchSuggestions({
        apiKey: current.apiKey,
        sessionId: sessionIdRef.current,
        transcriptChunks: current.transcript,
        settings: current.settings,
      });

      current.onBatch(result.batch);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch suggestions.";
      setError(message);
    } finally {
      setIsRefreshing(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!options.isRecording) {
      return;
    }

    let recurringTimer: number | null = null;

    const initialTimer = window.setTimeout(() => {
      void refresh({ silentWhenEmpty: true });
      recurringTimer = window.setInterval(() => {
        void refresh({ silentWhenEmpty: true });
      }, 30_000);
    }, 30_000);

    return () => {
      window.clearTimeout(initialTimer);
      if (recurringTimer !== null) {
        window.clearInterval(recurringTimer);
      }
    };
  }, [options.isRecording, refresh]);

  return {
    refresh,
    isRefreshing,
    error,
    lastUpdatedAt,
  };
}
