import { normalizeChatMarkdown } from "@/lib/normalizeChatMarkdown";
import type { ChatMessage as ChatMessageType } from "@/types";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  message: ChatMessageType;
}

/** Normalize raw backend text before passing to ReactMarkdown */
function normalizeMarkdown(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/([^\n])\n(\|)/g, "$1\n\n$2")
    .replace(/(\|[^\n]+)\n([^|\n])/g, "$1\n\n$2");
}

function buildMarkdownComponents(variant: "assistant" | "user"): Partial<Components> {
  const link =
    variant === "user"
      ? "text-sky-200 underline decoration-sky-400/50 underline-offset-2 hover:text-sky-100"
      : "text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200";

  const body =
    variant === "user"
      ? "text-[13px] leading-relaxed text-sky-50/90"
      : "text-[13px] leading-relaxed text-slate-200/95";

  const muted =
    variant === "user" ? "text-sky-200/85 marker:text-sky-400/60" : "text-slate-200/95 marker:text-slate-500";

  return {
    h1: ({ children }) => (
      <h1
        className={
          variant === "user"
            ? "mb-2 mt-4 border-b border-sky-200/20 pb-1.5 text-base font-semibold tracking-tight text-sky-50 first:mt-0"
            : "mb-2 mt-4 border-b border-white/10 pb-1.5 text-base font-semibold tracking-tight text-slate-50 first:mt-0"
        }
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={
          variant === "user"
            ? "mb-1.5 mt-3.5 border-b border-sky-200/15 pb-1 text-[0.95rem] font-semibold text-sky-50 first:mt-0"
            : "mb-1.5 mt-3.5 border-b border-white/10 pb-1 text-[0.95rem] font-semibold text-slate-100 first:mt-0"
        }
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={
          variant === "user"
            ? "mb-1 mt-3 text-[0.9rem] font-semibold text-sky-100 first:mt-0"
            : "mb-1 mt-3 text-[0.9rem] font-semibold text-slate-100 first:mt-0"
        }
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4
        className={
          variant === "user"
            ? "mb-1 mt-2.5 text-[0.85rem] font-semibold text-sky-100 first:mt-0"
            : "mb-1 mt-2.5 text-[0.85rem] font-semibold text-slate-200 first:mt-0"
        }
      >
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className={`mb-2 whitespace-pre-wrap last:mb-0 [&:empty]:hidden ${body}`}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul className={`mb-2 ml-0 list-outside list-disc space-y-1.5 pl-5 last:mb-0 ${muted}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`mb-2 ml-0 list-outside list-decimal space-y-1.5 pl-5 last:mb-0 ${muted}`}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-0.5 [&>p]:mb-1 [&>p:last-child]:mb-0">{children}</li>,
    strong: ({ children }) => (
      <strong className={variant === "user" ? "font-semibold text-sky-50" : "font-semibold text-slate-50"}>
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em className={variant === "user" ? "italic text-sky-100/90" : "italic text-slate-200"}>
        {children}
      </em>
    ),
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt ?? ""}
        className="my-2 max-h-52 max-w-full rounded-md border border-white/10 object-contain"
        loading="lazy"
      />
    ),
    hr: () => <hr className="my-4 border-0 border-t border-white/15" />,
    blockquote: ({ children }) => (
      <blockquote
        className={
          variant === "user"
            ? "my-2 border-l-[3px] border-sky-300/50 bg-sky-950/30 py-1.5 pl-3 pr-2 text-[13px] leading-relaxed text-sky-100/90"
            : "my-2 border-l-[3px] border-sky-500/50 bg-sky-500/[0.06] py-1.5 pl-3 pr-2 text-[13px] leading-relaxed text-slate-300"
        }
      >
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} className={link} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    code: ({ className, children, ...props }) => {
      const isFenced = Boolean(className?.includes("language-"));
      if (isFenced) {
        return (
          <code className={`${className ?? ""} block font-mono text-[12px]`} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code
          className="rounded border border-white/15 bg-black/35 px-1 py-px font-mono text-[0.82em] text-sky-100/90"
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-md border border-white/12 bg-black/45 p-3 text-[12px] leading-relaxed text-slate-200">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-3 w-full overflow-x-auto rounded-md border border-white/12 bg-black/20 shadow-inner">
        <table className="w-full border-collapse text-left text-[12px] leading-snug text-slate-200">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-white/15 bg-white/[0.04]">{children}</thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-white/[0.06] last:border-0">{children}</tr>,
    th: ({ children }) => (
      <th className="border border-white/10 px-2.5 py-2 font-semibold text-slate-100">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-white/10 px-2.5 py-2 align-top break-words text-slate-300">{children}</td>
    ),
  };
}

const remarkPlugins = [remarkGfm];

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const raw = message.content?.trim() ? message.content : "…";
  const content = normalizeMarkdown(raw);
  const variant = isUser ? "user" : "assistant";
  const components = buildMarkdownComponents(variant);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "max-w-[min(100%,34rem)] border-sky-200/25 bg-sky-500/12 text-sky-50"
            : "w-full max-w-full border-white/12 bg-white/[0.035] text-slate-100"
        }`}
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
          {message.role}
        </p>
        <div className={`chat-markdown${isUser ? " chat-markdown--user" : ""}`}>
          <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
