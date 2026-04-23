import type { Suggestion } from "@/types";

interface SuggestionCardProps {
  suggestion: Suggestion;
  onClick: (suggestion: Suggestion) => void;
}

const typeLabels: Record<Suggestion["type"], string> = {
  question_to_ask: "Question",
  talking_point: "Talking Point",
  direct_answer: "Direct Answer",
  fact_check: "Fact Check",
  clarification: "Clarification",
};

export function SuggestionCard({ suggestion, onClick }: SuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(suggestion)}
      className="w-full rounded-md border border-cyan-200/20 bg-cyan-400/5 p-3 text-left transition hover:border-cyan-200/50 hover:bg-cyan-400/10"
    >
      <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-cyan-200">
        {typeLabels[suggestion.type]}
      </p>
      <p className="mb-1 text-sm font-semibold text-slate-100">{suggestion.title}</p>
      <p className="mb-2 text-sm text-slate-300">{suggestion.preview}</p>
      <p className="text-xs text-slate-400">Why now: {suggestion.why_now}</p>
    </button>
  );
}
