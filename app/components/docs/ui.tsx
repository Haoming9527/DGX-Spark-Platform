"use client";

import type React from "react";
import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Info } from "lucide-react";
import { capabilityInfo } from "@/lib/models/modelCapabilities";
import { apiBase, endpointUrl } from "./config";
import { useCopy } from "./hooks";
import { scrollToSection } from "./nav";

export function DocSection({ id, icon, title, summary, children }: {
  id: string; icon: React.ReactNode; title: string; summary: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-nvidia-green/20 bg-nvidia-green/10">{icon}</span>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        </div>
        <p className="max-w-3xl text-[15px] leading-7 text-foreground/65">{summary}</p>
      </div>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-sm font-bold uppercase tracking-wide text-foreground/45">{children}</h3>;
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <p className="max-w-3xl text-sm leading-6 text-foreground/65">{children}</p>;
}

export function Steps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nvidia-green/12 text-xs font-bold text-nvidia-green">{index + 1}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground">{step.title}</div>
            <div className="mt-0.5 text-sm leading-6 text-foreground/60">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Callout({ children, tone = "note" }: { children: React.ReactNode; tone?: "note" | "warning" }) {
  const warning = tone === "warning";
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm leading-6 ${warning ? "border-amber-500/30 bg-amber-500/8 text-foreground/75" : "border-border bg-panel text-foreground/65"}`}>
      {warning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-nvidia-green" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-panel-hover px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" onClick={() => copy(text, label)} title={`Copy ${label}`}
      className={`shrink-0 cursor-pointer text-foreground/50 transition-colors hover:text-foreground ${className}`}>
      {copied ? <Check className="h-4 w-4 text-nvidia-green" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export function CodeTabs<T extends string>({ snippets, initial }: { snippets: Record<T, string>; initial?: T }) {
  const languages = Object.keys(snippets) as T[];
  const [active, setActive] = useState<T>(initial ?? languages[0]);
  const code = snippets[active];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center overflow-x-auto border-b border-border">
        {languages.map((language) => (
          <button key={language} type="button" onClick={() => setActive(language)}
            className={`relative cursor-pointer px-4 py-3 text-sm font-bold transition-colors ${active === language ? "text-nvidia-green" : "text-foreground/55 hover:text-foreground"}`}>
            {language === "REST" ? "curl" : language}
            {active === language && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-nvidia-green" />}
          </button>
        ))}
        <CopyButton text={code} label="code" className="ml-auto px-4" />
      </div>
      <pre className="max-h-[520px] overflow-auto bg-background p-5 font-mono text-[13px] leading-6 text-foreground/85">{code}</pre>
    </div>
  );
}

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-xs font-bold uppercase text-foreground/45">{label}</div>
      {hint && <div className="mt-1 text-xs leading-5 text-foreground/55">{hint}</div>}
      <div className="mt-2 flex items-center gap-3 rounded-md border border-border/70 bg-background px-3 py-2.5">
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-nvidia-green">{value}</code>
        <CopyButton text={value} label={label} />
      </div>
    </div>
  );
}

// The two URL forms developers ask for: SDK base URL and the full endpoint for raw HTTP.
export function EndpointUrls({ method = "POST", path }: { method?: "GET" | "POST"; path: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <CopyField label="Base URL (SDKs)" value={apiBase} hint={<>Set as <Code>base_url</Code> / <Code>baseURL</Code>. The SDK adds the path.</>} />
      <CopyField label={`Endpoint (${method}, raw HTTP)`} value={endpointUrl(path)} hint="Use with curl, Postman, fetch or no-code tools." />
    </div>
  );
}

export function ParamTable({ rows }: { rows: { name: string; type: string; required?: boolean; description: React.ReactNode }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-panel text-xs uppercase tracking-wide text-foreground/45">
          <tr><th className="px-4 py-2.5 font-semibold">Parameter</th><th className="px-4 py-2.5 font-semibold">Type</th><th className="px-4 py-2.5 font-semibold">Description</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-border/70 align-top">
              <td className="px-4 py-2.5 font-mono text-[13px] text-foreground">
                {row.name}{row.required && <span className="ml-1.5 font-sans text-[11px] font-semibold text-amber-600">required</span>}
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-foreground/55">{row.type}</td>
              <td className="px-4 py-2.5 leading-6 text-foreground/65">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResponseExample({ json, title = "Example response" }: { json: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-bold text-foreground/75 hover:text-foreground">
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />{title}
      </button>
      {open && <pre className="max-h-[420px] overflow-auto border-t border-border bg-background p-5 font-mono text-[13px] leading-6 text-foreground/80">{json}</pre>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  completion: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  vision: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  tools: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  thinking: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  embedding: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  decision: "border-nvidia-green/35 bg-nvidia-green/10 text-nvidia-green-dark dark:text-nvidia-green-light",
};

export function CapabilityBadge({ capability }: { capability: string }) {
  const info = capabilityInfo(capability);
  return (
    <span title={info.description}
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold ${BADGE_TONES[capability] ?? "border-border bg-panel-hover text-foreground/65"}`}>
      {info.label}
    </span>
  );
}

// "Works with" line for guides: the capability a model needs, linking to the model list.
export function WorksWith({ capabilities }: { capabilities: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/60">
      <span className="font-semibold text-foreground/75">Requires a model with</span>
      {capabilities.map((capability) => <CapabilityBadge key={capability} capability={capability} />)}
      <a href="#models" onClick={(event) => { event.preventDefault(); scrollToSection("models"); }}
        className="text-nvidia-green underline-offset-2 hover:underline">See models</a>
    </div>
  );
}
