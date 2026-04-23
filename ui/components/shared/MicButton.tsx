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
      className="inline-flex items-center gap-2 rounded-md border border-sky-300/50 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
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
