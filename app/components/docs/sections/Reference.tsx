"use client";

import { AlertCircle, Route, ListChecks, ShieldCheck } from "lucide-react";
import { endpointUrl, endpoints } from "../config";
import { useCopy } from "../hooks";
import { scrollToSection } from "../nav";
import { errorResponse } from "../snippets/responses";
import { Callout, CapabilityBadge, Code, DocSection, Prose, ResponseExample } from "../ui";
import { Check, Copy } from "lucide-react";

function EndpointRow({ method, path, purpose, capability, guide }: (typeof endpoints)[number]) {
  const { copied, copy } = useCopy();
  return (
    <tr className="border-t border-border/70 align-top">
      <td className="px-4 py-2.5">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${method === "GET" ? "bg-sky-500/12 text-sky-700 dark:text-sky-300" : "bg-nvidia-green/12 text-nvidia-green-dark dark:text-nvidia-green-light"}`}>{method}</span>
      </td>
      <td className="px-4 py-2.5">
        <button type="button" onClick={() => copy(endpointUrl(path), "url")} title="Copy full URL"
          className="group inline-flex cursor-pointer items-center gap-1.5 text-left font-mono text-[13px] text-foreground">
          {path}
          {copied ? <Check className="h-3.5 w-3.5 text-nvidia-green" /> : <Copy className="h-3.5 w-3.5 text-foreground/30 group-hover:text-foreground/70" />}
        </button>
      </td>
      <td className="px-4 py-2.5 leading-6 text-foreground/65">
        {purpose}
        {guide && <> <a href={`#${guide}`} onClick={(event) => { event.preventDefault(); scrollToSection(guide); }} className="text-nvidia-green underline-offset-2 hover:underline">Guide</a></>}
      </td>
      <td className="px-4 py-2.5">{capability ? <CapabilityBadge capability={capability} /> : <span className="text-foreground/35">—</span>}</td>
    </tr>
  );
}

export function Endpoints() {
  return (
    <DocSection id="endpoints" icon={<Route className="h-5 w-5 text-nvidia-green" />} title="Endpoints"
      summary="Every route the API serves. Click a path to copy its full URL; SDKs only need the base URL.">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase tracking-wide text-foreground/45">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Method</th><th className="px-4 py-2.5 font-semibold">Path</th>
              <th className="px-4 py-2.5 font-semibold">Use</th><th className="px-4 py-2.5 font-semibold">Needs</th>
            </tr>
          </thead>
          <tbody>{endpoints.map((endpoint) => <EndpointRow key={endpoint.path} {...endpoint} />)}</tbody>
        </table>
      </div>
      <Prose>All routes take <Code>Authorization: Bearer dgx_sk_…</Code> and JSON bodies up to 48 MiB.</Prose>
      <Callout>
        <b>Chat completions or completions?</b> Use <Code>/v1/chat/completions</Code> for almost everything: it takes a{" "}
        <Code>messages</Code> list with roles and supports images, tools, structured JSON and the platform system prompt.{" "}
        <Code>/v1/completions</Code> is OpenAI&apos;s legacy endpoint: it takes one <Code>prompt</Code> string, returns{" "}
        <Code>choices[0].text</Code>, and is only worth using for older tools and autocomplete plugins built for it.
      </Callout>
    </DocSection>
  );
}

const statusRows = [
  { code: "400", meaning: "Bad request or capability mismatch", action: "Check the body, and that the model has the tag your request needs (for example Vision for images)." },
  { code: "401", meaning: "Missing or invalid API key", action: "Send Authorization: Bearer with a current key." },
  { code: "404", meaning: "Unknown or restricted model, or unknown route", action: "Use a name from the Models list and a path from Endpoints." },
  { code: "413", meaning: "Request too large", action: "Shrink the body or images (see each guide's limits)." },
  { code: "429", meaning: "Rate or concurrency limit", action: "Wait for the Retry-After header, then retry." },
  { code: "503", meaning: "AI server asleep or shutting down", action: "Wake the server or retry later." },
  { code: "5xx", meaning: "Server or model failure", action: "Retry; if it persists, check the Status page." },
];

export function ErrorsUsage() {
  return (
    <DocSection id="errors-usage" icon={<AlertCircle className="h-5 w-5 text-nvidia-green" />} title="Errors & usage"
      summary="Errors use standard HTTP status codes and an OpenAI-style error body.">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase tracking-wide text-foreground/45">
            <tr><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Meaning</th><th className="px-4 py-2.5 font-semibold">What to do</th></tr>
          </thead>
          <tbody>
            {statusRows.map((row) => (
              <tr key={row.code} className="border-t border-border/70 align-top">
                <td className="px-4 py-2.5 font-mono text-[13px] font-semibold text-foreground">{row.code}</td>
                <td className="px-4 py-2.5 text-foreground/75">{row.meaning}</td>
                <td className="px-4 py-2.5 leading-6 text-foreground/60">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResponseExample title="Example error" json={errorResponse} />
      <Prose>Requests, tokens, success rate and errors per key are on the Usage page.</Prose>
    </DocSection>
  );
}

export function Roadmap() {
  return (
    <DocSection id="roadmap" icon={<ListChecks className="h-5 w-5 text-nvidia-green" />} title="Roadmap"
      summary="What works today and what is waiting on models.">
      <ul className="space-y-2 text-sm leading-6 text-foreground/65">
        <li><b className="text-foreground">Live today:</b> chat, streaming, vision input, thinking, tools, embeddings, structured JSON and System One decisions.</li>
        <li><b className="text-foreground">Waiting on models:</b> image generation and edits, speech and transcription, video. These OpenAI routes return 404 on purpose.</li>
        <li><b className="text-foreground">Not planned:</b> Assistants, Files, Batch, Fine-tuning and Realtime.</li>
      </ul>
    </DocSection>
  );
}

export function Terms() {
  return (
    <DocSection id="terms" icon={<ShieldCheck className="h-5 w-5 text-nvidia-green" />} title="T&C"
      summary="Use the API only with keys you own, keep credentials private, and don't send data you aren't allowed to process.">
      <Callout>Availability depends on the DGX Spark and the models loaded on it. Usage analytics are for operational visibility. Review generated output before using it in production.</Callout>
    </DocSection>
  );
}
