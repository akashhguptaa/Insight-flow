"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import type { ChatMessage as ChatMessageType } from "@/types";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  error: string | null;
  onSend: (message: string) => Promise<void>;
  disabled: boolean;
}

const STICK_THRESHOLD_PX = 80;

export function ChatPanel({
  messages,
  isStreaming,
  error,
  onSend,
  disabled,
}: ChatPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el) {
      return;
    }

    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      stickBottomRef.current = distanceFromBottom < STICK_THRESHOLD_PX;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) {
      return;
    }

    if (messages.length > prevMessageCountRef.current) {
      el.scrollTop = el.scrollHeight;
      stickBottomRef.current = true;
    }

    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !isStreaming || !stickBottomRef.current) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  return (
    <section className="column-shell">
      <div className="column-chrome flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          3. Chat (Detailed Answers)
        </h2>
        <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          Session-only
        </span>
      </div>

      {error ? (
        <p className="shrink-0 border-b border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : null}

      <div className="column-scroll-wrap">
        <div
          ref={listRef}
          className="column-scroll-fade panel-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2"
        >
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[10rem] flex-col items-center justify-center px-2 text-center text-sm text-slate-500">
              Click a suggestion to send it here for a streamed answer, or type below.
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-1">
              {messages.map((message, index) => (
                <ChatMessage
                  key={`${message.timestamp}-${message.role}-${index}`}
                  message={message}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="column-chrome shrink-0 border-t border-white/10 px-3 py-2">
        <ChatInput disabled={disabled} isSending={isStreaming} onSend={onSend} />
      </div>
    </section>
  );
}
