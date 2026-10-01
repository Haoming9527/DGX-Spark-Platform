"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Clock, Zap, Copy, Check, Pencil, RotateCcw } from "lucide-react";
import { Message } from "../types/chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import type { Components } from "react-markdown";
import { useTheme } from "./ui/ThemeToggle";
import Image from "next/image";
import { McpActivity } from "./McpActivity";
import { copyWithSourceCitations, displayWithSourceCitations, remarkSourceCitations } from "@/lib/searchCitations";
import { ResponseActivity } from "./ui/ResponseActivity";
import { SourceChip, SourcesDisclosure } from "./ui/SourceCitations";
import { MessageEditor } from "./ui/MessageEditor";
import { FollowUps } from "./ui/FollowUps";
import styles from "./MessageBubble.module.css";
import { rehypeStreamingWords } from "@/lib/streamingMarkdown";

interface MessageBubbleProps {
  message: Message;
  onRetry?: () => void;
  retryDisabled?: boolean;
  onEdit?: (text: string) => void;
  editDisabled?: boolean;
  showActions?: boolean;
  streaming?: boolean;
  onToolDecision?: (id: string, approved: boolean) => void;
  onFollowUp?: (prompt: string) => void;
  followUpDisabled?: boolean;
}

function isProseMistakenForCode(code: string): boolean {
  const t = code.trim();
  if (!t || t.includes("\n")) return false;
  if (t.length < 48) return false;
  if (/[{};=<>]|=>|\b(def|class|function|import|const|let|var)\b/.test(t)) return false;
  return /[.?!)]$/.test(t) || /^(would|do|can|could|should|shall|may|let|if|what|how|why)\b/i.test(t);
}

function markdownComponents(isDark: boolean, highlight: boolean, sources: Message["sources"] = []): Components {
  const knownSources = new Map(sources.map(source => [source.id, source]));
  return {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const text = String(children).replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = Boolean(className) || text.includes("\n");

    if (!isBlock) {
      return (
        <code className="whitespace-pre-wrap break-words rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[0.875em] text-foreground/90 ring-1 ring-border/50">
          {children}
        </code>
      );
    }

    if (!match && isProseMistakenForCode(text)) {
      return <p className="my-3 leading-relaxed">{text}</p>;
    }

    if (match) {
      return (
        <div className="not-prose my-3 overflow-hidden rounded-xl ring-1 ring-border/80">
          <div className="flex items-center justify-between bg-panel-hover/80 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-foreground/40">
            <span>{match[1]}</span>
          </div>
          {highlight ? (
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={match[1]}
              PreTag="div"
              wrapLongLines
              customStyle={{
                margin: 0,
                background: "var(--code-bg)",
                color: isDark ? "#abb2bf" : "#383a42",
                padding: "1rem 1.1rem",
                fontSize: "0.8125rem",
              }}
              codeTagProps={{
                style: { whiteSpace: "pre-wrap", wordBreak: "break-word" },
              }}
            >
              {text}
            </SyntaxHighlighter>
          ) : (
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words bg-[var(--code-bg)] p-4 font-mono text-[0.8125rem] leading-relaxed text-foreground/85">
              <code>{text}</code>
            </pre>
          )}
        </div>
      );
    }

    return (
      <pre className="not-prose my-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--code-bg)] p-4 font-mono text-[0.8125rem] leading-relaxed text-foreground/85 ring-1 ring-border/80">
        <code className="bg-transparent p-0 font-inherit text-inherit ring-0">{text}</code>
      </pre>
    );
  },
  a({ href, children, node }) {
    const sourceId = node?.properties?.["data-source-id"] || node?.properties?.dataSourceId;
    if (sourceId) {
      const source = knownSources.get(String(sourceId));
      return source ? <SourceChip source={source} /> : null;
    }
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
}

export function MessageBubble({ message, onRetry, retryDisabled = false, onEdit, editDisabled = false, showActions, streaming = false, onToolDecision, onFollowUp, followUpDisabled }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const components = useMemo(
    () => markdownComponents(isDark, isUser || !streaming, message.sources),
    [isDark, isUser, streaming, message.sources],
  );
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const userMessageRef = useRef<HTMLDivElement>(null);
  const editorId = useId();
  const displayContent = useMemo(() => !isUser && /\[source(?::[a-zA-Z0-9_-]*)?$/.test(message.content)
    ? displayWithSourceCitations(message.content, message.sources, true)
    : message.content, [isUser, message.content, message.sources]);

  const handleCopy = async () => {
    const text = displayContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(copyWithSourceCitations(text, message.sources));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div ref={userMessageRef} tabIndex={-1} className={`${styles.userMessage} ${editing ? styles.editing : ""}`}>
          <div className="sticker !rounded-[1.25rem] px-4 py-2.5 text-[15px] leading-normal text-foreground">
            {message.images && message.images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {message.images.map((src, i) => (
                  <Image
                    key={`${message.id}-img-${i}`}
                    src={src}
                    alt=""
                    width={640}
                    height={480}
                    unoptimized
                    className="h-auto max-h-40 w-auto max-w-full rounded-xl object-contain ring-1 ring-border"
                  />
                ))}
              </div>
            )}
            {editing && onEdit ? (
              <MessageEditor
                id={editorId}
                content={message.content}
                disabled={editDisabled}
                onCancel={() => {
                  setEditing(false);
                  requestAnimationFrame(() => {
                    if (editButtonRef.current && !editButtonRef.current.disabled) editButtonRef.current.focus();
                    else userMessageRef.current?.focus();
                  });
                }}
                onSave={(text) => {
                  if (editDisabled) return;
                  onEdit(text);
                  setEditing(false);
                  requestAnimationFrame(() => userMessageRef.current?.focus());
                }}
              />
            ) : message.content ? (
              <div className="whitespace-pre-wrap break-words [&_p]:m-0 [&_p+_p]:mt-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="m-0">{children}</p>,
                    code: components.code,
                    pre: components.pre,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : null}
          </div>
          {onEdit && !editing && (
            <button
              ref={editButtonRef}
              type="button"
              className={styles.actionButton}
              aria-label="Edit message"
              title={editDisabled ? "Wait for the response to finish before editing" : "Edit message"}
              disabled={editDisabled}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    );
  }

  const isThinking = streaming && message.isThinking;
  const hasActions = Boolean(showActions && message.content && !isThinking);
  const visibleTools = message.mcpActivity?.filter(activity => ["approval", "running", "unknown", "failed"].includes(activity.status)) ?? [];

  return (
    <div className="group flex w-full flex-col gap-2">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-1">
        <ResponseActivity message={message} streaming={streaming} />
        {visibleTools.length > 0 && <McpActivity activities={visibleTools} onDecision={onToolDecision} />}

        {message.content && (
          <div className={`${styles.answer} w-full min-w-0 p-[3px] text-[15px] leading-relaxed text-foreground`}
            data-stopped={message.responseStatus === "stopped" || message.responseStatus === "error"}>
            <div className="prose prose-sm dark:prose-invert max-w-none break-words text-foreground sm:prose-base prose-p:my-3 prose-p:leading-relaxed prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-headings:font-display prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none prose-a:text-nvidia-green prose-a:no-underline hover:prose-a:underline">
                <ReactMarkdown remarkPlugins={[remarkGfm, [remarkSourceCitations, message.sources]]} rehypePlugins={[rehypeStreamingWords]} components={components}>
                  {displayContent}
                </ReactMarkdown>
            </div>
          </div>
        )}

        {(hasActions || (!streaming && !!message.sources?.length)) && (
          <SourcesDisclosure sources={!streaming ? message.sources ?? [] : []}>
            {hasActions && <>
            <button
              type="button"
              onClick={handleCopy}
              className={styles.actionButton}
              aria-label={copied ? "Copied" : "Copy"}
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
                disabled={retryDisabled}
                className={styles.actionButton}
                aria-label="Try again"
                title={retryDisabled ? "Wait for the response to finish before retrying" : "Try again"}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            {typeof message.evalCount === "number" && typeof message.evalDurationMs === "number" && message.evalDurationMs > 0 && (
              <div className="ml-1.5 flex items-center gap-2.5 font-mono text-[11px] tabular-nums text-muted">
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
            </>}
          </SourcesDisclosure>
        )}
        {!streaming && message.responseStatus === "complete" && onFollowUp && !!message.followUps?.length && (
          <FollowUps prompts={message.followUps} onSelect={onFollowUp} disabled={followUpDisabled} />
        )}
      </div>
    </div>
  );
}
