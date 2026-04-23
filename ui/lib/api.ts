import type {
  ChatMessage,
  PromptSettings,
  SuggestionBatch,
  TranscriptChunk,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function parseError(response: Response): Promise<Error> {
  try {
    const data = (await response.json()) as { detail?: string };
    return new Error(data.detail ?? `Request failed with ${response.status}`);
  } catch {
    return new Error(`Request failed with ${response.status}`);
  }
}

export async function healthCheck(): Promise<{ status: string; service: string }> {
  const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as { status: string; service: string };
}

export async function transcribeChunk(input: {
  apiKey: string;
  audioBlob: Blob;
  filename?: string;
  language?: string;
  prompt?: string;
}): Promise<{ text: string; timestamp: string }> {
  const fd = new FormData();
  fd.append("audio", input.audioBlob, input.filename ?? "chunk.webm");
  fd.append("api_key", input.apiKey);

  if (input.language) {
    fd.append("language", input.language);
  }
  if (input.prompt) {
    fd.append("prompt", input.prompt);
  }

  const response = await fetch(`${API_URL}/api/transcribe`, {
    method: "POST",
    body: fd,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as { text: string; timestamp: string };
}

export async function fetchSuggestions(input: {
  apiKey: string;
  sessionId?: string;
  transcriptChunks: TranscriptChunk[];
  settings: PromptSettings;
}): Promise<{ batch: SuggestionBatch }> {
  const response = await fetch(`${API_URL}/api/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: input.apiKey,
      session_id: input.sessionId,
      transcript_chunks: input.transcriptChunks,
      settings: input.settings,
    }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as { batch: SuggestionBatch };
}

export async function streamChatAnswer(input: {
  apiKey: string;
  userMessage: string;
  transcriptChunks: TranscriptChunk[];
  chatHistory: ChatMessage[];
  settings: PromptSettings;
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: input.apiKey,
      user_message: input.userMessage,
      transcript_chunks: input.transcriptChunks,
      chat_history: input.chatHistory,
      settings: {
        chat_prompt: input.settings.chat_prompt,
        expanded_context_window: input.settings.expanded_context_window,
        suggestion_context_window: input.settings.suggestion_context_window,
      },
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    input.onError(await parseError(response));
    return;
  }

  if (!response.body) {
    input.onError(new Error("No stream body from chat response"));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payload = trimmed.replace(/^data:\s?/, "");
        if (payload === "[DONE]") {
          input.onDone();
          return;
        }

        input.onToken(payload);
      }
    }

    input.onDone();
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      input.onDone();
      return;
    }

    input.onError(error instanceof Error ? error : new Error("Stream error"));
  } finally {
    reader.releaseLock();
  }
}
