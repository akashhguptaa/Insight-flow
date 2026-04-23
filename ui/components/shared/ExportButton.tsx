"use client";

interface ExportButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

export function ExportButton({ disabled, onClick }: ExportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center rounded-md border border-emerald-300/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Export Session
    </button>
  );
}
