"use client";

import { Eye, MessageSquare, Radio } from "lucide-react";
import { chatSnippets } from "../snippets/chat";
import { chatResponse, streamResponse } from "../snippets/responses";
import { streamingSnippets } from "../snippets/streaming";
import { visionSnippets } from "../snippets/vision";
import { Callout, Code, CodeTabs, DocSection, EndpointUrls, ParamTable, Prose, ResponseExample, SubHeading, WorksWith } from "../ui";

export function Chat() {
  return (
    <DocSection id="chat" icon={<MessageSquare className="h-5 w-5 text-nvidia-green" />} title="Chat completions"
      summary="Send a list of messages and get the model's reply. The request and response match OpenAI's Chat Completions API.">
      <Prose><b className="text-foreground">When to use it:</b> answering questions, writing, summarising, coding help, and any multi-turn conversation.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["completion"]} />
      <EndpointUrls path="/v1/chat/completions" />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={chatSnippets} />
      <ResponseExample json={chatResponse} />
      <SubHeading>Parameters</SubHeading>
      <ParamTable rows={[
        { name: "model", type: "string", required: true, description: "A model name from the Models list." },
        { name: "messages", type: "array", required: true, description: <>Conversation so far. Roles: <Code>system</Code>, <Code>user</Code>, <Code>assistant</Code>, <Code>tool</Code>. Content is a string or an array of parts.</> },
        { name: "stream", type: "boolean", description: <>Send tokens as server-sent events. See Streaming.</> },
        { name: "max_tokens", type: "integer", description: "Upper limit on generated tokens." },
        { name: "temperature", type: "number", description: "Higher is more varied, lower is more focused." },
        { name: "reasoning_effort", type: "string", description: <>On Thinking models: <Code>low</Code>, <Code>medium</Code>, <Code>high</Code>, or <Code>none</Code> to turn thinking off.</> },
        { name: "tools", type: "array", description: "Function definitions the model may call. See Tools & MCP." },
        { name: "response_format", type: "object", description: "Ask for JSON. See Structured output." },
      ]} />
      <Callout>
        Text files can be sent inline as a <Code>file</Code> part with <Code>file_data</Code> (UTF-8). There is no Files API, so
        <Code>file_id</Code> is not supported.
      </Callout>
    </DocSection>
  );
}

export function Streaming() {
  return (
    <DocSection id="streaming" icon={<Radio className="h-5 w-5 text-nvidia-green" />} title="Streaming"
      summary="Receive the reply token by token instead of waiting for the whole answer, using server-sent events like OpenAI.">
      <Prose><b className="text-foreground">When to use it:</b> chat interfaces and long answers, so users see output immediately.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["completion"]} />
      <EndpointUrls path="/v1/chat/completions" />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={streamingSnippets} />
      <ResponseExample title="Example stream" json={streamResponse} />
      <SubHeading>How it works</SubHeading>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/65">
        <li>Set <Code>stream: true</Code>. Each event is a <Code>chat.completion.chunk</Code>.</li>
        <li>Append <Code>choices[0].delta.content</Code> from each chunk to rebuild the reply.</li>
        <li>Token usage arrives in the last chunk; the stream ends with <Code>data: [DONE]</Code>.</li>
      </ul>
      <Callout>With curl, add <Code>-N</Code> so output isn&apos;t buffered while chunks arrive.</Callout>
    </DocSection>
  );
}

export function Vision() {
  return (
    <DocSection id="vision" icon={<Eye className="h-5 w-5 text-nvidia-green" />} title="Vision"
      summary="Send images with your message and ask about them: describe a photo, read text (OCR), or answer questions about a chart or screenshot.">
      <Prose><b className="text-foreground">When to use it:</b> image understanding. Generating or editing images is not available.</Prose>
      <SubHeading>Before you begin</SubHeading>
      <WorksWith capabilities={["vision"]} />
      <EndpointUrls path="/v1/chat/completions" />
      <SubHeading>Request</SubHeading>
      <CodeTabs snippets={visionSnippets} />
      <SubHeading>Image input</SubHeading>
      <ParamTable rows={[
        { name: "type", type: '"image_url"', required: true, description: <>Add as a content part next to a <Code>text</Code> part.</> },
        { name: "image_url.url", type: "string", required: true, description: "A data URL, raw base64, or a public http(s) URL (ports 80/443, no redirects)." },
      ]} />
      <Callout>
        PNG, JPEG, WebP or GIF, up to 8 MiB and 40 megapixels per image, 32 images and 32 MiB per request. Models without the
        Vision tag reject image parts.
      </Callout>
    </DocSection>
  );
}
