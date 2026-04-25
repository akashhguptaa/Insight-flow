"use client";

interface MicButtonProps {
  isRecording: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function MicButton({ isRecording, disabled, onClick }: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg border border-sky-200/35 bg-sky-400/15 px-4 py-2 text-sm font-semibold text-sky-100 shadow-[0_10px_22px_rgba(56,189,248,0.18)] transition hover:-translate-y-0.5 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isRecording ? "animate-pulse bg-rose-400" : "bg-sky-300"
        }`}
      />
      {isRecording ? "Stop mic" : "Start mic"}
    </button>
  );
}
