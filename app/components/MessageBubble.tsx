"use client";

import { useState } from "react";
import { ChevronRight, Clock, Zap, Loader2, Copy, Check, RotateCcw } from "lucide-react";
import { Message } from "../types/chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import type { Components } from "react-markdown";

interface MessageBubbleProps {
  message: Message;
  onRetry?: () => void;
  showActions?: boolean;
}

/** Language-less fences that are really chat prose (models do this a lot). */
function isProseMistakenForCode(code: string): boolean {
  const t = code.trim();
  if (!t || t.includes("\n")) return false;
  if (t.length < 48) return false;
  if (/[{};=<>]|=>|\b(def|class|function|import|const|let|var)\b/.test(t)) return false;
  return /[.?!)]$/.test(t) || /^(would|do|can|could|should|shall|may|let|if|what|how|why)\b/i.test(t);
}

const markdownComponents: Components = {
  pre({ children }) {
    // Let `code` own the chrome so we don't double-wrap.
    return <>{children}</>;
  },
  code({ className, children, ...props }) {
    const text = String(children).replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = Boolean(className) || text.includes("\n");

    if (!isBlock) {
      return (
        <code
          className="whitespace-pre-wrap break-words rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[0.875em] text-foreground/90 ring-1 ring-border/50"
          {...props}
        >
          {children}
        </code>
      );
    }

    // ``` … ``` with English copy — render as normal paragraph, not a scrolling code chip
    if (!match && isProseMistakenForCode(text)) {
      return <p className="my-3 leading-relaxed">{text}</p>;
    }

    if (match) {
      return (
        <div className="my-3 overflow-hidden rounded-xl ring-1 ring-border/80">
          <div className="flex items-center justify-between bg-panel-hover/80 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-foreground/40">
            <span>{match[1]}</span>
          </div>
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            wrapLongLines
            customStyle={{
              margin: 0,
              background: "var(--code-bg)",
              padding: "1rem 1.1rem",
              fontSize: "0.8125rem",
            }}
            codeTagProps={{
              style: { whiteSpace: "pre-wrap", wordBreak: "break-word" },
            }}
            {...props}
          >
            {text}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <pre className="my-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--code-bg)] p-4 font-mono text-[0.8125rem] leading-relaxed text-foreground/85 ring-1 ring-border/80">
        <code className="bg-transparent p-0 font-inherit text-inherit ring-0">{text}</code>
      </pre>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-nvidia-green underline-offset-2 hover:underline"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 max-w-full overflow-x-auto rounded-xl ring-1 ring-border/80">
        <table className="m-0 w-full text-left text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="bg-foreground/[0.03] text-xs uppercase tracking-wide text-foreground/55">
        {children}
      </thead>
    );
  },
  th({ children }) {
    return <th className="border-b border-border px-3.5 py-2.5 font-semibold">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-border/60 px-3.5 py-2.5">{children}</td>;
  },
};

export function MessageBubble({ message, onRetry, showActions }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = message.content?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[85%] rounded-[22px] bg-[#f4f4f4] px-4 py-2.5 text-[15px] leading-normal text-[#0d0d0d] dark:bg-[#2f2f2f] dark:text-[#ececec] sm:max-w-[70%]">
          <div className="whitespace-pre-wrap break-words [&_p]:m-0 [&_p+_p]:mt-2">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="m-0">{children}</p>,
                code: markdownComponents.code,
                pre: markdownComponents.pre,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  const showBody =
    Boolean(message.content) || (!message.isThinking && !message.thoughtProcess);

  return (
    <div className="group flex w-full flex-col gap-2">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-1">
        {message.thoughtProcess && (
          <details
            open={message.isThinking || undefined}
            className="group/think w-full max-w-full"
          >
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-foreground/45 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/70 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open/think:rotate-90" />
              <span className="font-medium tracking-tight">
                {message.isThinking ? "Thinking" : "Thoughts"}
              </span>
              {message.isThinking && (
                <span className="ml-0.5 inline-flex gap-0.5" aria-hidden>
                  <span className="h-1 w-1 animate-pulse rounded-full bg-foreground/35 [animation-delay:0ms]" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-foreground/35 [animation-delay:150ms]" />
                  <span className="h-1 w-1 animate-pulse rounded-full bg-foreground/35 [animation-delay:300ms]" />
                </span>
              )}
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap border-l-2 border-border/80 pl-3.5 text-[13px] leading-relaxed text-foreground/50">
              {message.thoughtProcess}
            </div>
          </details>
        )}

        {showBody && (
          <div className="w-full min-w-0 overflow-hidden text-[15px] leading-relaxed text-foreground">
            {message.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words sm:prose-base prose-p:my-3 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:tracking-tight prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none prose-a:text-nvidia-green prose-a:no-underline hover:prose-a:underline">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-1 text-foreground/40">
                <Loader2 className="h-4 w-4 animate-spin text-nvidia-green" />
                <span className="text-sm">Generating…</span>
              </div>
            )}
          </div>
        )}

        {showActions && message.content && !message.isThinking && (
          <div className="mt-0.5 flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/80"
              title={copied ? "Copied" : "Copy"}
            >
              {copied ? (
                <Check className="h-4 w-4 text-nvidia-green" />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/80"
                title="Try again"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            {message.evalCount && message.evalDurationMs && (
              <div className="ml-1.5 flex items-center gap-2.5 text-[11px] tabular-nums text-foreground/30">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {(message.evalDurationMs / 1000).toFixed(1)}s
                </span>
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {message.evalCount} tok
                </span>
                <span>
                  {((message.evalCount / message.evalDurationMs) * 1000).toFixed(1)} t/s
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
