"use client";

import { FormEvent, useState } from "react";

interface ChatInputProps {
  disabled?: boolean;
  isSending: boolean;
  onSend: (value: string) => Promise<void>;
}

export function ChatInput({ disabled, isSending, onSend }: ChatInputProps) {
  const [value, setValue] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) {
      return;
    }

    setValue("");
    await onSend(text);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder="Ask anything…"
        className="h-11 w-full rounded-md border border-white/10 bg-white/[0.02] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || isSending || !value.trim()}
        className="h-11 rounded-md border border-sky-300/40 bg-sky-500/20 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/35 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSending ? "..." : "Send"}
      </button>
    </form>
  );
}
