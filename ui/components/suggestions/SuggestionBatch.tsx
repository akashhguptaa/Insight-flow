import { SuggestionCard } from "@/components/suggestions/SuggestionCard";
import type { Suggestion, SuggestionBatch as SuggestionBatchType } from "@/types";

interface SuggestionBatchProps {
  batch: SuggestionBatchType;
  onClickSuggestion: (suggestion: Suggestion) => void;
}

export function SuggestionBatch({ batch, onClickSuggestion }: SuggestionBatchProps) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.02] p-3">
      <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        Batch @
        {" "}
        {new Date(batch.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>

      <div className="space-y-2">
        {batch.suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={`${batch.created_at}-${suggestion.title}-${index}`}
            suggestion={suggestion}
            onClick={onClickSuggestion}
          />
        ))}
      </div>
    </article>
  );
}
