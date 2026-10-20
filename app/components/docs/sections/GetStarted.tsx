"use client";

import Link from "next/link";
import { BookOpen, Code as CodeIcon, KeyRound, Server } from "lucide-react";
import { apiBase, endpointUrl, keyPlaceholder } from "../config";
import type { useModels } from "../hooks";
import { ModelCatalog } from "../ModelCatalog";
import { scrollToSection } from "../nav";
import { quickstartSnippets } from "../snippets/quickstart";
import { chatResponse } from "../snippets/responses";
import { Callout, Code, CodeTabs, CopyField, DocSection, Prose, ResponseExample, Steps, SubHeading } from "../ui";

const startLinks = [
  { id: "quickstart", label: "Quickstart", hint: "Your first request in a few minutes" },
  { id: "chat", label: "Chat completions", hint: "The core text API" },
  { id: "streaming", label: "Streaming", hint: "Show tokens as they generate" },
  { id: "vision", label: "Vision", hint: "Ask questions about images" },
  { id: "tools", label: "Tools & MCP", hint: "Let the model call your functions" },
  { id: "embeddings", label: "Embeddings", hint: "Vectors for search and RAG" },
  { id: "systemone", label: "System One", hint: "Typed decisions" },
  { id: "endpoints", label: "Endpoints", hint: "Every route and its full URL" },
];

function SectionLink({ id, label, hint }: { id: string; label: string; hint: string }) {
  return (
    <a href={`#${id}`} onClick={(event) => { event.preventDefault(); scrollToSection(id); }}
      className="rounded-lg border border-border bg-panel px-4 py-3 transition-colors hover:border-nvidia-green/40 hover:bg-panel-hover">
      <div className="text-sm font-bold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-foreground/50">{hint}</div>
    </a>
  );
}

export function Overview() {
  return (
    <DocSection id="overview" icon={<BookOpen className="h-5 w-5 text-nvidia-green" />} title="Overview"
      summary="An OpenAI-compatible API for the models running on DGX Spark. If your code or tool already works with OpenAI, change the base URL and the API key, and pick a model from the list below.">
      <div className="grid gap-3 md:grid-cols-2">
        <CopyField label="Base URL" value={apiBase}
          hint={<>For OpenAI SDKs and tools that ask for a base URL (LangChain, LiteLLM, Open WebUI, Cursor…).</>} />
        <CopyField label="Chat completions endpoint" value={endpointUrl("/v1/chat/completions")}
          hint="For raw HTTP requests: curl, Postman, fetch, n8n or Zapier." />
      </div>
      <Callout tone="warning">
        Don&apos;t put <Code>/chat/completions</Code> in an SDK&apos;s base URL. The SDK adds the path itself, so the request would
        go to <Code>/v1/chat/completions/chat/completions</Code> and fail with 404.
      </Callout>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {startLinks.map((link) => <SectionLink key={link.id} {...link} />)}
      </div>
    </DocSection>
  );
}

export function Quickstart() {
  return (
    <DocSection id="quickstart" icon={<CodeIcon className="h-5 w-5 text-nvidia-green" />} title="Quickstart"
      summary="Send your first chat completion in three steps.">
      <Steps steps={[
        { title: "Create an API key", body: <>Open <Link href="/apikeys/manage" className="text-nvidia-green underline-offset-2 hover:underline">API Keys</Link> and create a key. It starts with <Code>dgx_sk_</Code> and is shown once.</> },
        { title: "Point your client at DGX Spark", body: <>Use the base URL <Code>{apiBase}</Code> in an OpenAI SDK, or call the endpoint directly with curl.</> },
        { title: "Send a request", body: <>Set <Code>model</Code> to a name from <a href="#models" onClick={(event) => { event.preventDefault(); scrollToSection("models"); }} className="text-nvidia-green underline-offset-2 hover:underline">Models</a> and send your messages.</> },
      ]} />
      <CodeTabs snippets={quickstartSnippets} />
      <ResponseExample json={chatResponse} />
      <Prose>Next: stream the answer with <a href="#streaming" onClick={(event) => { event.preventDefault(); scrollToSection("streaming"); }} className="text-nvidia-green underline-offset-2 hover:underline">Streaming</a>, or let the model call your functions with <a href="#tools" onClick={(event) => { event.preventDefault(); scrollToSection("tools"); }} className="text-nvidia-green underline-offset-2 hover:underline">Tools</a>.</Prose>
    </DocSection>
  );
}

export function Authentication() {
  return (
    <DocSection id="authentication" icon={<KeyRound className="h-5 w-5 text-nvidia-green" />} title="Authentication"
      summary="Every request needs your personal API key as a bearer token in the Authorization header.">
      <CopyField label="Header" value={`Authorization: Bearer ${keyPlaceholder}`} />
      <Callout>
        Keep the full key secret: don&apos;t put it in browser code or commit it. After creation the dashboard only shows its
        prefix. If a key leaks, delete it on the API Keys page and create a new one.
      </Callout>
    </DocSection>
  );
}

export function Models({ state }: { state: ReturnType<typeof useModels> }) {
  return (
    <DocSection id="models" icon={<Server className="h-5 w-5 text-nvidia-green" />} title="Models"
      summary="Set model to one of these names in every request. Tags show what each model can do; filter by the capabilities your feature needs.">
      <ModelCatalog {...state} />
      <SubHeading>What the tags mean</SubHeading>
      <ul className="grid gap-x-6 gap-y-1.5 text-sm text-foreground/65 sm:grid-cols-2">
        <li><b className="text-foreground">Chat</b>: text generation in chat completions.</li>
        <li><b className="text-foreground">Vision</b>: accepts images (see Vision).</li>
        <li><b className="text-foreground">Tools</b>: function calling (see Tools &amp; MCP).</li>
        <li><b className="text-foreground">Thinking</b>: reasons before answering; set <Code>reasoning_effort</Code>.</li>
        <li><b className="text-foreground">Embeddings</b>: vectors from <Code>/v1/embeddings</Code>.</li>
        <li><b className="text-foreground">Decision</b>: typed decisions from <Code>/v1/systemone</Code>, not chat.</li>
      </ul>
      <Prose>The list is live from Ollama on the DGX Spark and shows the models your key can use. You can also fetch it with <Code>GET {endpointUrl("/v1/models")}</Code>.</Prose>
    </DocSection>
  );
}
