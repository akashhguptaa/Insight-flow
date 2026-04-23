"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SAMPLE_RATE = 16_000;
const CHUNK_WINDOW_MS = 5_000;
const CHUNK_OVERLAP_MS = 500;
const CHUNK_WINDOW_SAMPLES = (SAMPLE_RATE * CHUNK_WINDOW_MS) / 1_000;
const CHUNK_OVERLAP_SAMPLES = (SAMPLE_RATE * CHUNK_OVERLAP_MS) / 1_000;
const CHUNK_STRIDE_SAMPLES = CHUNK_WINDOW_SAMPLES - CHUNK_OVERLAP_SAMPLES;
const CHUNK_TICK_MS = 250;
const MAX_BUFFER_SAMPLES = SAMPLE_RATE * 30;
const MIN_UPLOAD_SAMPLES = SAMPLE_RATE / 10;

interface BufferedFrame {
  start: number;
  end: number;
  audio: Float32Array;
}

interface UseMicOptions {
  apiKey: string;
  language?: string;
  prompt?: string;
  appendTranscript: (text: string, timestamp?: string) => string | null;
  updateTranscriptById: (id: string, text: string) => void;
}

export interface MicDebugInfo {
  segmentId: number;
  rowId: string | null;
  pendingBoundarySample: number | null;
  totalSamples: number;
  nextChunkStart: number;
  inFlight: boolean;
}

export function useMic(options: UseMicOptions) {
  const vadRef = useRef<MicVAD | null>(null);
  const bufferedFramesRef = useRef<BufferedFrame[]>([]);
  const totalSamplesRef = useRef(0);
  const nextChunkStartRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const flushInFlightRef = useRef(false);
  const segmentIdRef = useRef(0);
  const pendingBoundarySampleRef = useRef<number | null>(null);
  const lastTranscriptBySegmentRef = useRef<Map<number, string>>(new Map());
  const segmentTextByIdRef = useRef<Map<number, string>>(new Map());
  const segmentRowIdBySegmentRef = useRef<Map<number, string>>(new Map());

  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<MicDebugInfo>({
    segmentId: 0,
    rowId: null,
    pendingBoundarySample: null,
    totalSamples: 0,
    nextChunkStart: 0,
    inFlight: false,
  });

  const syncDebugInfo = useCallback(() => {
    const segmentId = segmentIdRef.current;
    setDebugInfo({
      segmentId,
      rowId: segmentRowIdBySegmentRef.current.get(segmentId) ?? null,
      pendingBoundarySample: pendingBoundarySampleRef.current,
      totalSamples: totalSamplesRef.current,
      nextChunkStart: nextChunkStartRef.current,
      inFlight: flushInFlightRef.current,
    });
  }, []);

  const reportMicError = useCallback((message: string, cause?: unknown) => {
    if (cause) {
      console.error(`[mic] ${message}`, cause);
    } else {
      console.error(`[mic] ${message}`);
    }
    setError(message);
  }, []);

  const audioToWavBlob = useCallback((audio: Float32Array) => {
    const buffer = new ArrayBuffer(44 + audio.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + audio.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16_000, true);
    view.setUint32(28, 32_000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, audio.length * 2, true);

    let offset = 44;
    for (let i = 0; i < audio.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, audio[i]));
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const resetAudioBuffer = useCallback(() => {
    bufferedFramesRef.current = [];
    totalSamplesRef.current = 0;
    nextChunkStartRef.current = 0;
    syncDebugInfo();
  }, [syncDebugInfo]);

  const pushFrame = useCallback((frame: Float32Array) => {
    const audio = new Float32Array(frame);
    const start = totalSamplesRef.current;
    const end = start + audio.length;

    bufferedFramesRef.current.push({
      start,
      end,
      audio,
    });

    totalSamplesRef.current = end;

    const pruneBefore = Math.max(0, nextChunkStartRef.current - CHUNK_WINDOW_SAMPLES);
    while (
      bufferedFramesRef.current.length > 0 &&
      bufferedFramesRef.current[0]!.end < pruneBefore
    ) {
      bufferedFramesRef.current.shift();
    }

    const maxStartToKeep = Math.max(0, totalSamplesRef.current - MAX_BUFFER_SAMPLES);
    while (
      bufferedFramesRef.current.length > 0 &&
      bufferedFramesRef.current[0]!.end < maxStartToKeep
    ) {
      bufferedFramesRef.current.shift();
    }
  }, []);

  const readWindow = useCallback((startSample: number, endSample: number) => {
    const length = Math.max(0, endSample - startSample);
    const out = new Float32Array(length);
    let writeOffset = 0;

    for (const frame of bufferedFramesRef.current) {
      if (frame.end <= startSample) {
        continue;
      }
      if (frame.start >= endSample) {
        break;
      }

      const sourceStart = Math.max(startSample, frame.start);
      const sourceEnd = Math.min(endSample, frame.end);
      const sourceOffset = sourceStart - frame.start;
      const sourceLength = sourceEnd - sourceStart;

      out.set(frame.audio.subarray(sourceOffset, sourceOffset + sourceLength), writeOffset);
      writeOffset += sourceLength;
    }

    return out;
  }, []);

  const overlapLength = useCallback((previous: string, current: string) => {
    const max = Math.min(previous.length, current.length);

    for (let size = max; size > 0; size -= 1) {
      if (previous.slice(-size) === current.slice(0, size)) {
        return size;
      }
    }

    return 0;
  }, []);

  const hasSignal = useCallback((audio: Float32Array) => {
    if (audio.length < MIN_UPLOAD_SAMPLES) {
      return false;
    }

    let maxAbs = 0;
    let powerSum = 0;

    for (let index = 0; index < audio.length; index += 1) {
      const value = Math.abs(audio[index]);
      maxAbs = Math.max(maxAbs, value);
      powerSum += value * value;
    }

    const rms = Math.sqrt(powerSum / audio.length);
    return maxAbs >= 0.01 || rms >= 0.003;
  }, []);

  const sendSpeechChunk = useCallback(
    async (audio: Float32Array, segmentId: number) => {
      try {
        if (!hasSignal(audio)) {
          console.info("[mic] Skipping near-silence chunk", { samples: audio.length });
          return;
        }

        const audioBlob = audioToWavBlob(audio);
        console.log("audio blob size:", audioBlob.size);
        const formData = new FormData();
        formData.append("audio", audioBlob, "chunk.wav");
        formData.append("api_key", options.apiKey);

        if (options.language) {
          formData.append("language", options.language);
        }
        if (options.prompt) {
          formData.append("prompt", options.prompt);
        }

        const response = await fetch(`${API_URL}/api/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          reportMicError(
            `Transcribe request failed with ${response.status}${
              detail ? `: ${detail}` : ""
            }`,
          );
          return;
        }

        const payload = (await response.json()) as {
          text?: string;
          timestamp?: string;
        };

        const nextText = payload.text?.trim() ?? "";
        if (nextText) {
          const previousText = lastTranscriptBySegmentRef.current.get(segmentId) ?? "";
          const shared = overlapLength(previousText, nextText);
          const deltaText = nextText.slice(shared).trim();

          lastTranscriptBySegmentRef.current.set(segmentId, nextText);

          if (deltaText) {
            const existingSegmentText =
              segmentTextByIdRef.current.get(segmentId) ?? "";
            const nextSegmentText = `${existingSegmentText} ${deltaText}`.trim();
            segmentTextByIdRef.current.set(segmentId, nextSegmentText);

            const rowId = segmentRowIdBySegmentRef.current.get(segmentId);
            if (rowId) {
              options.updateTranscriptById(rowId, nextSegmentText);
            } else {
              const newRowId = options.appendTranscript(
                nextSegmentText,
                payload.timestamp,
              );
              if (newRowId) {
                segmentRowIdBySegmentRef.current.set(segmentId, newRowId);
                syncDebugInfo();
              }
            }
          }

          return;
        }

        console.warn("[mic] Empty transcript returned for speech chunk");
      } catch (err) {
        reportMicError("Failed to upload speech chunk.", err);
        return;
      }
    },
    [audioToWavBlob, hasSignal, options, overlapLength, reportMicError, syncDebugInfo],
  );

  const resetTranscriptSegment = useCallback(() => {
    segmentIdRef.current += 1;
    const previousSegmentId = segmentIdRef.current - 1;
    lastTranscriptBySegmentRef.current.delete(previousSegmentId);
    segmentTextByIdRef.current.delete(previousSegmentId);
    segmentRowIdBySegmentRef.current.delete(previousSegmentId);
    syncDebugInfo();
  }, [syncDebugInfo]);

  const flushReadyChunks = useCallback(async (flushTail = false) => {
    if (flushInFlightRef.current) {
      return;
    }

    flushInFlightRef.current = true;
    syncDebugInfo();

    try {
      const boundarySample = pendingBoundarySampleRef.current;

      while (
        totalSamplesRef.current - nextChunkStartRef.current >= CHUNK_WINDOW_SAMPLES
      ) {
        const chunkStart = nextChunkStartRef.current;
        const chunkEnd = chunkStart + CHUNK_WINDOW_SAMPLES;

        if (boundarySample !== null && chunkEnd > boundarySample) {
          break;
        }

        const chunkAudio = readWindow(chunkStart, chunkEnd);
        const segmentId = segmentIdRef.current;

        await sendSpeechChunk(chunkAudio, segmentId);
        nextChunkStartRef.current += CHUNK_STRIDE_SAMPLES;
        syncDebugInfo();
      }

      if (boundarySample !== null) {
        const segmentId = segmentIdRef.current;
        const tailStart = Math.max(0, boundarySample - CHUNK_WINDOW_SAMPLES);
        const tailAudio = readWindow(tailStart, boundarySample);

        if (tailAudio.length > 0 && boundarySample > nextChunkStartRef.current) {
          await sendSpeechChunk(tailAudio, segmentId);
        }

        nextChunkStartRef.current = boundarySample;
        pendingBoundarySampleRef.current = null;
        syncDebugInfo();
        resetTranscriptSegment();
      }

      if (flushTail) {
        const total = totalSamplesRef.current;
        const segmentId = segmentIdRef.current;

        if (total > 0 && total > nextChunkStartRef.current) {
          const tailStart = Math.max(0, total - CHUNK_WINDOW_SAMPLES);
          const tailAudio = readWindow(tailStart, total);

          if (tailAudio.length > 0) {
            await sendSpeechChunk(tailAudio, segmentId);
          }

          nextChunkStartRef.current = total;
          syncDebugInfo();
        }
      }
    } finally {
      flushInFlightRef.current = false;
      syncDebugInfo();
    }
  }, [readWindow, resetTranscriptSegment, sendSpeechChunk, syncDebugInfo]);

  const cleanVAD = useCallback(async () => {
    const activeVAD = vadRef.current;
    vadRef.current = null;

    if (activeVAD) {
      await activeVAD.destroy();
    }
  }, []);

  const startMic = useCallback(async () => {
    if (vadRef.current) {
      return;
    }

    if (!options.apiKey) {
      const message = "Add your Groq API key in Settings before recording.";
      reportMicError(message);
      throw new Error(message);
    }

    try {
      resetAudioBuffer();
      lastTranscriptBySegmentRef.current.clear();
      segmentTextByIdRef.current.clear();
      segmentRowIdBySegmentRef.current.clear();
      segmentIdRef.current = 0;
      pendingBoundarySampleRef.current = null;
      syncDebugInfo();

      console.info("[mic] Initializing VAD...");
      const vad = await MicVAD.new({
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        redemptionMs: 300,
        onFrameProcessed: (_probabilities, frame) => {
          pushFrame(frame);
        },
        onSpeechStart: () => {
          if (pendingBoundarySampleRef.current !== null) {
            void flushReadyChunks();
          }
          console.info("[mic] Speech start detected");
          setIsListening(true);
          syncDebugInfo();
        },
        onVADMisfire: () => {
          console.warn("[mic] VAD misfire: speech too short to submit");
          setIsListening(false);
        },
        onSpeechEnd: async (audio) => {
          console.info("[mic] Speech end detected", { samples: audio.length });
          setIsListening(false);

          // Close the active segment only after flushing up to this sample boundary.
          pendingBoundarySampleRef.current = totalSamplesRef.current;
          syncDebugInfo();
          await flushReadyChunks();
        },
      });

      vadRef.current = vad;
      await vad.start();

      clearTick();
      tickRef.current = window.setInterval(() => {
        void flushReadyChunks();
      }, CHUNK_TICK_MS);

      console.info("[mic] VAD started");
      setIsRecording(true);
      syncDebugInfo();
    } catch (err) {
      reportMicError("Failed to start microphone VAD. Check browser console.", err);
      clearTick();
      await cleanVAD();
      setIsListening(false);
      setIsRecording(false);
      throw err;
    }
  }, [
    cleanVAD,
    clearTick,
    flushReadyChunks,
    options.apiKey,
    pushFrame,
    reportMicError,
    resetAudioBuffer,
    resetTranscriptSegment,
    syncDebugInfo,
  ]);

  const stopMic = useCallback(() => {
    if (!vadRef.current) {
      return;
    }

    void (async () => {
      clearTick();
      await flushReadyChunks(true);
      await vadRef.current?.pause();
      await cleanVAD();
      setIsListening(false);
      setIsRecording(false);
      syncDebugInfo();
    })();
  }, [cleanVAD, clearTick, flushReadyChunks, syncDebugInfo]);

  useEffect(() => {
    return () => {
      clearTick();
      void cleanVAD();
    };
  }, [cleanVAD, clearTick]);

  return {
    isRecording,
    isListening,
    error,
    debugInfo,
    startMic,
    stopMic,
  };
}
