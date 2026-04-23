"use client";

import { useRef } from "react";

import { SuggestionBatch } from "@/components/suggestions/SuggestionBatch";
import { useScrollToBottomOnLengthIncrease } from "@/hooks/useScrollToBottomOnLengthIncrease";
import type { Suggestion, SuggestionBatch as SuggestionBatchType } from "@/types";

interface SuggestionsPanelProps {
  batches: SuggestionBatchType[];
  isRefreshing: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  refreshIntervalSeconds: number;
  onRefresh: () => void;
  onClickSuggestion: (suggestion: Suggestion) => void;
  disabled: boolean;
}

export function SuggestionsPanel({
  batches,
  isRefreshing,
  error,
  lastUpdatedAt,
  refreshIntervalSeconds,
  onRefresh,
  onClickSuggestion,
  disabled,
}: SuggestionsPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  useScrollToBottomOnLengthIncrease(listRef, batches.length);

  const intervalLabel = `~${refreshIntervalSeconds}s`;

  return (
    <section className="column-shell">
      <div className="column-chrome flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          2. Live Suggestions
        </h2>
        <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {batches.length} batches
        </span>
      </div>

      <div className="column-chrome flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || isRefreshing}
          className="shrink-0 rounded-md border border-cyan-300/40 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing…" : "Reload suggestions"}
        </button>
        <p className="text-[11px] leading-snug text-slate-500">
          Auto-refresh every {intervalLabel} · cached
          {lastUpdatedAt ? (
            <>
              {" "}
              · last{" "}
              {new Date(lastUpdatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </>
          ) : null}
        </p>
      </div>

      {error ? (
        <p className="shrink-0 border-b border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}

      <div className="column-scroll-wrap">
        <div
          ref={listRef}
          className="column-scroll-fade panel-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2"
        >
          {batches.length === 0 ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center px-2 text-center text-sm text-slate-500">
              Suggestions will appear once recording begins and transcript context is
              available.
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-1">
              {batches.map((batch) => (
                <SuggestionBatch
                  key={batch.created_at}
                  batch={batch}
                  onClickSuggestion={onClickSuggestion}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
