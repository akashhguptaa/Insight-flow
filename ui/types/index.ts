export type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "direct_answer"
  | "fact_check"
  | "clarification";

export interface TranscriptChunk {
  id?: string;
  text: string;
  timestamp: string;
  speaker?: string;
}

export interface Suggestion {
  type: SuggestionType;
  title: string;
  preview: string;
  why_now: string;
}

export interface SuggestionBatch {
  created_at: string;
  suggestions: [Suggestion, Suggestion, Suggestion];
}

export interface PromptSettings {
  suggestions_prompt?: string;
  detailed_answer_prompt?: string;
  chat_prompt?: string;
  suggestion_context_window: number;
  expanded_context_window: number;
}

export interface AppSettings extends PromptSettings {
  api_key: string;
  transcribe_language?: string;
  transcribe_prompt?: string;
  refresh_interval_seconds: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface SessionExport {
  exported_at: string;
  session: {
    transcript_chunks: TranscriptChunk[];
    suggestion_batches: SuggestionBatch[];
    chat_history: ChatMessage[];
  };
  settings_used: {
    suggestion_context_window: number;
    expanded_context_window: number;
  };
}
