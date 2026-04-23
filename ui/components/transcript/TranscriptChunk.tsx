interface TranscriptChunkProps {
  text: string;
  timestamp: string;
}

export function TranscriptChunk({ text, timestamp }: TranscriptChunkProps) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        {new Date(timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
      <p className="text-sm leading-relaxed text-slate-100">{text}</p>
    </div>
  );
}
