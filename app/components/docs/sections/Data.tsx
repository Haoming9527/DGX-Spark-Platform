"use client";

import { BrainCircuit, ListChecks } from "lucide-react";
import type { useModels } from "../hooks";
import { ModelCatalog } from "../ModelCatalog";
import { embeddingsSnippets } from "../snippets/embeddings";
import { embeddingsResponse } from "../snippets/responses";
import { systemOneSnippets } from "../snippets/systemone";
import { Callout, Code, CodeTabs, DocSection, EndpointUrls, ParamTable, Prose, ResponseExample, SubHeading, WorksWith } from "../ui";

export function Embeddings() {
  return (
    <DocSection id="embeddings" icon={<BrainCircuit className="h-5 w-5 text-nvidia-green" />} title="Embeddings"
      summary="Turn text into vectors that capture its meaning, so you can compare texts by similarity.">
      <Prose><b className="text-foreground">When to use it:</b> semantic search, retrieval-augmented generation (RAG), clustering and deduplication.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["embedding"]} />
      <EndpointUrls path="/v1/embeddings" />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={embeddingsSnippets} />
      <ResponseExample json={embeddingsResponse} />
      <SubHeading>Parameters</SubHeading>
      <ParamTable rows={[
        { name: "model", type: "string", required: true, description: "A model with the Embeddings tag." },
        { name: "input", type: "string | string[]", required: true, description: <>Text to embed. One vector is returned per input in <Code>data[].embedding</Code>.</> },
      ]} />
      <Callout>Token-id arrays are not supported as input. Chat and vision models reject embedding requests.</Callout>
    </DocSection>
  );
}

export function SystemOne({ state }: { state: ReturnType<typeof useModels> }) {
  return (
    <DocSection id="systemone" icon={<ListChecks className="h-5 w-5 text-nvidia-green" />} title="System One"
      summary="Ask a decision model typed questions about some input and get structured answers with probabilities, instead of free text.">
      <Prose><b className="text-foreground">When to use it:</b> routing and classification (which team, which category), yes/no checks with a probability, and scoring on a scale.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["decision"]} />
      <EndpointUrls path="/v1/systemone" />
      <SubHeading>Available decision models</SubHeading>
      <ModelCatalog {...state} only="decision" filters={false} />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={systemOneSnippets} />
      <SubHeading>Parameters</SubHeading>
      <ParamTable rows={[
        { name: "model", type: "string", required: true, description: "A model with the Decision tag." },
        { name: "state", type: "string | object | array", required: true, description: "The input to decide about. Must not be empty. Shared by all questions." },
        { name: "questions", type: "object", required: true, description: "1–64 named questions, each evaluated independently. Answers keep the same names." },
        { name: "questions.*.type", type: '"choice" | "noul" | "score"', required: true, description: <><Code>choice</Code> picks one of 2–26 named criteria; <Code>noul</Code> returns the probability of true; <Code>score</Code> uses 2–26 descriptions from lowest to highest and returns a weighted score.</> },
        { name: "images", type: "string[]", description: "Raw base64 PNG, JPEG or WebP. URLs and data URLs are not accepted." },
        { name: "keep_alive", type: "string", description: <>How long to keep the model loaded, for example <Code>&quot;5m&quot;</Code>.</> },
      ]} />
      <SubHeading>Response</SubHeading>
      <Prose>
        One JSON response with <Code>model</Code>, <Code>answers</Code> keyed by question name, and <Code>usage.input_tokens</Code> /{" "}
        <Code>usage.output_tokens</Code>. Choice and score answers include probabilities and confidence. Zero output tokens is valid.
      </Prose>
      <Callout>
        Requires Ollama 0.35.1+. The body must fit in 64 KiB without images or 32 MiB with images, and within the model&apos;s
        context; input is never truncated. System One has no chat messages, streaming, tools or generation controls, and chat
        routes reject decision models with <Code>model_endpoint_mismatch</Code>. Full contract:{" "}
        <a className="text-nvidia-green underline-offset-2 hover:underline" href="https://docs.ollama.com/api/systemone" target="_blank" rel="noreferrer">Ollama API reference</a>.
      </Callout>
    </DocSection>
  );
}
