"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight, ChevronDown, Globe } from "lucide-react";
import type { SearchSource } from "@/lib/searchEvidence";
import { sourceDomain, sourceFaviconHref, sourceOutboundHref } from "@/lib/sourcePresentation";
import styles from "./SourceCitations.module.css";

const subscribe = () => () => {};
const browserHostname = () => window.location.hostname;
const serverHostname = () => "";

function SourceMark({ source }: { source: SearchSource }) {
  const icon = sourceFaviconHref(source);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  return <span aria-hidden="true" className={styles.mark}>
    {(!icon || failed === icon || loaded !== icon) && <Globe size={14} strokeWidth={1.7} />}
    {icon && failed !== icon && <Image src={icon} alt="" width={16} height={16} unoptimized
      referrerPolicy="no-referrer" className={styles.favicon} data-loaded={loaded === icon}
      onLoad={() => setLoaded(icon)} onError={() => setFailed(icon)} />}
  </span>;
}

export function SourceChip({ source }: { source: SearchSource }) {
  const hostname = useSyncExternalStore(subscribe, browserHostname, serverHostname);
  const href = sourceOutboundHref(source, hostname);
  if (!href) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" data-source-id={source.id}
    title={source.title} aria-label={`${sourceDomain(source)}: ${source.title}`} className={`not-prose ${styles.chip}`}>
    <SourceMark source={source} />
    <span className={styles.chipLabel}>{sourceDomain(source)}</span>
  </a>;
}

export function SourceList({ sources }: { sources: readonly SearchSource[] }) {
  const hostname = useSyncExternalStore(subscribe, browserHostname, serverHostname);
  if (!sources.length) return null;
  return <ul className={styles.list}>
    {sources.map((source, index) => {
      const href = sourceOutboundHref(source, hostname);
      const date = source.publishedAt ? new Date(source.publishedAt) : null;
      const content = <>
        <SourceMark source={source} />
        <span className={styles.description}>
          <span className={styles.title}>{source.title}</span>
          <span className={styles.meta}>{sourceDomain(source)} · {source.readStatus === "read" ? "Excerpt read" : source.readStatus === "unavailable" ? "Preview · page unavailable" : "Search preview"}
            {date && !Number.isNaN(date.getTime()) && <> · Published <time dateTime={source.publishedAt}>{date.toLocaleDateString(undefined, {
              month: "short", day: "numeric", year: "numeric", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt!) ? "UTC" : undefined,
            })}</time></>}
          </span>
        </span>
        {href && <ArrowUpRight aria-hidden size={13} className={styles.arrow} />}
      </>;
      return <li key={source.id || source.url} className={styles.item} style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}>{href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className={styles.row}>{content}</a>
        : <div className={styles.row}>{content}</div>}</li>;
    })}
  </ul>;
}

export function SourcesDisclosure({ sources, children }: { sources: readonly SearchSource[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={styles.sources}>
    <div className={styles.footer}>
      {children}
      {!!sources.length && <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className={styles.stack}>{sources.slice(0, 3).map(source => <SourceMark source={source} key={source.id} />)}</span>
        <span>{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
        <ChevronDown aria-hidden size={13} className={styles.chevron} data-open={open} />
      </button>}
    </div>
    {!!sources.length && <div id={id} className={styles.reveal} data-open={open} aria-hidden={!open} inert={!open}>
      <div className={styles.clip}><SourceList sources={sources} /></div>
    </div>}
  </div>;
}
