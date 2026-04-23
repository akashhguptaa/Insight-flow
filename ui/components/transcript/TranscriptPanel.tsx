"use client";

import { useRef } from "react";

import { MicButton } from "@/components/shared/MicButton";
import { TranscriptChunk } from "@/components/transcript/TranscriptChunk";
import { useScrollToBottomOnLengthIncrease } from "@/hooks/useScrollToBottomOnLengthIncrease";
import type { TranscriptChunk as TranscriptChunkType } from "@/types";

interface TranscriptPanelProps {
  transcript: TranscriptChunkType[];
  isRecording: boolean;
  isListening: boolean;
  error?: string | null;
  debugInfo?: {
    segmentId: number;
    rowId: string | null;
    pendingBoundarySample: number | null;
    totalSamples: number;
    nextChunkStart: number;
    inFlight: boolean;
  };
  onToggleMic: () => void;
  disabled: boolean;
}

export function TranscriptPanel({
  transcript,
  isRecording,
  isListening,
  error,
  debugInfo,
  onToggleMic,
  disabled,
}: TranscriptPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  useScrollToBottomOnLengthIncrease(listRef, transcript.length);

  const statusLabel = isRecording ? "RECORDING" : "IDLE";
  const vadLabel = !isRecording
    ? "VAD: off"
    : isListening
      ? "VAD: speech"
      : "VAD: idle";

  return (
    <section className="column-shell">
      <div className="column-chrome flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          1. Mic & transcript
        </h2>
        <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {statusLabel}
        </span>
      </div>

      <div className="column-chrome flex items-center justify-between gap-2 px-3 py-2">
        <MicButton
          isRecording={isRecording}
          disabled={disabled}
          onClick={onToggleMic}
        />
        <p className="text-[11px] tabular-nums text-slate-500">{vadLabel}</p>
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
          {debugInfo ? (
            <div className="mb-2 rounded-md border border-amber-300/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
              <p>
                seg={debugInfo.segmentId} row={debugInfo.rowId ?? "-"} boundary=
                {debugInfo.pendingBoundarySample ?? "-"}
              </p>
              <p>
                total={debugInfo.totalSamples} next={debugInfo.nextChunkStart}{" "}
                inFlight={debugInfo.inFlight ? "1" : "0"}
              </p>
            </div>
          ) : null}

          {transcript.length === 0 ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center px-2 text-center text-sm text-slate-500">
              No transcript yet. Start the mic to begin live capture.
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-1">
              {transcript.map((chunk, index) => (
                <TranscriptChunk
                  key={`${chunk.timestamp}-${index}`}
                  text={chunk.text}
                  timestamp={chunk.timestamp}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
