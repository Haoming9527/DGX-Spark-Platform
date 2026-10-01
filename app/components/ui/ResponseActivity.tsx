"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { McpIcon } from "./McpIcon";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../../types/chat";
import { SourceList } from "./SourceCitations";
import { useChatStickScroll } from "../useChatStickScroll";
import styles from "./ResponseActivity.module.css";

const thoughtComponents: Components = {
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto"><table>{children}</table></div>,
};

function Elapsed({ start, end }: { start: number; end?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end !== undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [end]);
  const seconds = Math.max(0, Math.floor(((end ?? now) - start) / 1000));
  return <span aria-hidden={end === undefined} title="Elapsed response time" className={styles.elapsed}>
    <span aria-hidden="true">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
    {end !== undefined && <span className="sr-only">{seconds} seconds elapsed</span>}
  </span>;
}

function ActivityMark() {
  return <span className={styles.mark} aria-hidden="true">
    <svg className={styles.dots} viewBox="0 0 20 20" focusable="false">
      {[[10, 2], [17, 6], [17, 14], [10, 18], [3, 14], [3, 6], [10, 10]].map(([cx, cy], index) =>
        <circle key={index} cx={cx} cy={cy} r="1.5" style={{ animationDelay: `${index * 110}ms` }} />)}
    </svg>
  </span>;
}

function SearchTrace({ sources, phase }: { sources: NonNullable<Message["sources"]>; phase: "searching" | "thinking" | "idle" }) {
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [disclosure, setDisclosure] = useState({ phase, expanded: phase !== "thinking" });
  if (disclosure.phase !== phase) {
    setDisclosure({ phase, expanded: phase === "thinking" ? false : phase === "searching" ? true : disclosure.expanded });
  }
  const expanded = disclosure.expanded;
  useLayoutEffect(() => {
    if (!expanded && panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
  }, [expanded]);
  return <>
    <button ref={toggleRef} type="button" className={styles.sourceToggle} aria-expanded={expanded} aria-controls={panelId}
      onClick={() => setDisclosure({ phase, expanded: !expanded })}>
      <Globe aria-hidden size={14} />{sources.length} {sources.length === 1 ? "source" : "sources"}
      <ChevronDown aria-hidden size={12} className={styles.chevron} data-open={expanded} />
    </button>
    <div ref={panelRef} id={panelId} className={styles.reveal} data-open={expanded} aria-hidden={!expanded} inert={!expanded}>
      <div className={styles.clip}><SourceList sources={sources} /></div>
    </div>
  </>;
}

export function ResponseActivity({ message, streaming }: { message: Message; streaming: boolean }) {
  const panelId = useId();
  const labelRef = useRef<HTMLSpanElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);
  const reasoningContentRef = useRef<HTMLDivElement>(null);
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const sources = message.sources ?? [];
  const tools = message.mcpActivity ?? [];
  const settledTools = tools.filter(tool => ["completed", "declined", "cancelled"].includes(tool.status));
  const hasDetails = Boolean(message.thoughtProcess || settledTools.length || sources.length);
  const active = streaming && (message.responseStatus === undefined || message.responseStatus === "running");
  useEffect(() => {
    if (!active) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    if (labelRef.current) observer.observe(labelRef.current);
    const visibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [active, hasDetails]);
  const expanded = hasDetails && (manualExpanded ?? (active && Boolean(message.isThinking || message.searching || sources.length)));
  useChatStickScroll(reasoningRef, reasoningContentRef, active && expanded && Boolean(message.thoughtProcess));
  const interrupted = message.responseStatus === "stopped" || message.responseStatus === "error";
  if (!active && !hasDetails && !interrupted) return null;

  const label = active
    ? tools.some(tool => tool.status === "approval") ? "Your approval is needed"
      : message.searching ? "Searching the web"
        : message.isThinking ? "Thinking"
          : message.mcpStatus?.replace(/[…\.]+$/, "") || (message.content ? "Writing answer" : "Preparing response")
    : message.responseStatus === "stopped" ? "Stopped"
      : message.responseStatus === "error" ? "Response interrupted"
        : message.thoughtProcess ? "Thoughts & activity" : settledTools.length ? "Tool activity" : "Search activity";
  const header = <>
    {active && <ActivityMark />}
    <span ref={labelRef} role="status" className={styles.label} data-working={active}>{label}</span>
    {message.responseStartedAt !== undefined && <Elapsed start={message.responseStartedAt} end={message.responseFinishedAt} />}
    {hasDetails && <ChevronDown aria-hidden size={14} className={styles.chevron} data-open={expanded} />}
  </>;

  return <div className={styles.activity} data-expanded={expanded} data-animate={active && onScreen && pageVisible}>
    {hasDetails ? <button type="button" className={styles.header} aria-expanded={expanded} aria-controls={panelId}
      onClick={() => setManualExpanded(!expanded)}>{header}</button>
      : <div className={styles.header}>{header}</div>}
    {hasDetails && <div id={panelId} className={styles.reveal} data-open={expanded} aria-hidden={!expanded} inert={!expanded}>
      <div className={styles.clip}>
        <div className={styles.trace}>
          {message.thoughtProcess && <section className={styles.section} aria-label="Model reasoning">
            <div ref={reasoningRef} className={`${styles.reasoning} custom-scrollbar prose prose-sm dark:prose-invert max-w-none break-words text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-foreground prose-code:text-foreground`}>
              <div ref={reasoningContentRef} className={styles.reasoningContent}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={thoughtComponents}>{message.thoughtProcess}</ReactMarkdown>
              </div>
            </div>
          </section>}
          {sources.length > 0 && <section className={styles.section} aria-label={active ? "Search sources" : "Search activity"}>
            {active ? <SearchTrace sources={sources} phase={message.searching ? "searching" : message.isThinking ? "thinking" : "idle"} /> : <p className={styles.searchSummary}>
              <Globe aria-hidden size={14} />Searched {sources.length} {sources.length === 1 ? "source" : "sources"}
            </p>}
          </section>}
          {settledTools.length > 0 && <section className={styles.section} aria-label="Tool activity">
            <h3 className={styles.sectionTitle}><McpIcon width={14} height={14} />Tools</h3>
            <ul className={styles.tools}>{settledTools.map(tool => <li key={tool.id}>
              <span className={styles.toolName}>{tool.server} · {tool.name}</span>
              <span className={styles.toolStatus}>{tool.status}</span>
            </li>)}</ul>
          </section>}
        </div>
      </div>
    </div>}
  </div>;
}
