"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  Code,
  Copy,
  Eye,
  KeyRound,
  ListChecks,
  MessageSquare,
  Radio,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const baseUrl = "https://api.dgxspark.dev";

const navGroups = [
  {
    id: "get-started",
    label: "Get started",
    items: [
      { id: "overview", label: "Overview" },
      { id: "quickstart", label: "Quickstart" },
      { id: "authentication", label: "Authentication" },
      { id: "models", label: "Models" },
    ],
  },
  {
    id: "guides",
    label: "Guides",
    items: [
      { id: "chat", label: "Chat completions" },
      { id: "streaming", label: "Streaming" },
      { id: "vision", label: "Vision" },
      { id: "embeddings", label: "Embeddings" },
      { id: "tools", label: "Tools & MCP" },
      { id: "structured", label: "Structured output" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    items: [
      { id: "roadmap", label: "Roadmap" },
      { id: "errors-usage", label: "Errors & usage" },
      { id: "terms", label: "T&C" },
    ],
  },
] as const;

type NavGroupId = (typeof navGroups)[number]["id"];

const allSectionIds = navGroups.flatMap((group) => group.items.map((item) => item.id));

function groupIdForSection(sectionId: string): NavGroupId | null {
  for (const group of navGroups) {
    if (group.items.some((item) => item.id === sectionId)) return group.id;
  }
  return null;
}

function initialSectionId(): string {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace(/^#/, "");
  return (allSectionIds as readonly string[]).includes(hash) ? hash : "overview";
}

const chatSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

response = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain how AI works in a few words"},
    ],
)

print(response.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const response = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain how AI works in a few words" },
  ],
});

console.log(response.choices[0].message.content);`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain how AI works in a few words"}
    ]
  }'`,
};

const streamingSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

stream = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[{"role": "user", "content": "Count to five."}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content or ""
    print(delta, end="", flush=True)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const stream = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [{ role: "user", content: "Count to five." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -N \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "stream": true,
    "messages": [{"role": "user", "content": "Count to five."}]
  }'`,
};

const visionSnippets = {
  Python: `from openai import OpenAI
import base64

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

img = base64.b64encode(open("photo.jpg", "rb").read()).decode()

response = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What is in this image?"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img}"},
            },
        ],
    }],
)

print(response.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const img = fs.readFileSync("photo.jpg").toString("base64");

const response = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "What is in this image?" },
      {
        type: "image_url",
        image_url: { url: \`data:image/jpeg;base64,\${img}\` },
      },
    ],
  }],
});

console.log(response.choices[0].message.content);`,
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6:35b-a3b",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What is in this image?"},
        {
          "type": "image_url",
          "image_url": {"url": "data:image/jpeg;base64,..."}
        }
      ]
    }]
  }'`,
};

const embeddingsSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

res = client.embeddings.create(
    model="nomic-embed-text:latest",
    input=[
        "DGX Spark runs local models",
        "Embeddings power search and RAG",
    ],
)

print(len(res.data[0].embedding), res.data[0].embedding[:4])`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const res = await client.embeddings.create({
  model: "nomic-embed-text:latest",
  input: [
    "DGX Spark runs local models",
    "Embeddings power search and RAG",
  ],
});

console.log(res.data[0].embedding.length, res.data[0].embedding.slice(0, 4));`,
  REST: `curl ${baseUrl}/v1/embeddings \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nomic-embed-text:latest",
    "input": [
      "DGX Spark runs local models",
      "Embeddings power search and RAG"
    ]
  }'`,
};

const toolsSnippets = {
  Python: `from openai import OpenAI
import json

client = OpenAI(api_key="dgx_sk_your_key_here", base_url="${baseUrl}/v1")

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
            },
            "required": ["city"],
        },
    },
}]

messages = [{"role": "user", "content": "Weather in Singapore in celsius?"}]
res = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=messages,
    tools=tools,
)
msg = res.choices[0].message
messages.append(msg)

for call in msg.tool_calls or []:
    args = json.loads(call.function.arguments)
    result = {"city": args["city"], "temp": 31, "unit": args.get("unit", "celsius")}
    messages.append({
        "role": "tool",
        "tool_call_id": call.id,
        "content": json.dumps(result),
    })

final = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=messages,
    tools=tools,
)
print(final.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get weather for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["city"],
    },
  },
}];

const messages = [{ role: "user", content: "Weather in Singapore in celsius?" }];
const res = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages,
  tools,
});
const msg = res.choices[0].message;
messages.push(msg);

for (const call of msg.tool_calls || []) {
  const args = JSON.parse(call.function.arguments);
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify({
      city: args.city,
      temp: 31,
      unit: args.unit || "celsius",
    }),
  });
}

const final = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages,
  tools,
});
console.log(final.choices[0].message.content);`,
};

const structuredSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(api_key="dgx_sk_your_key_here", base_url="${baseUrl}/v1")

schema = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["answer", "confidence"],
}

res = client.chat.completions.create(
    model="qwen3.6:35b-a3b",
    messages=[
        {"role": "user", "content": "Is Paris the capital of France? Return JSON."}
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {"name": "qa", "schema": schema, "strict": True},
    },
)
print(res.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const schema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["answer", "confidence"],
};

const res = await client.chat.completions.create({
  model: "qwen3.6:35b-a3b",
  messages: [
    { role: "user", content: "Is Paris the capital of France? Return JSON." },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "qa", schema, strict: true },
  },
});
console.log(res.choices[0].message.content);`,
};

const quickstartSnippets = {
  Python: chatSnippets.Python,
  JavaScript: chatSnippets.JavaScript,
  Go: `package main

import (
  "context"
  "fmt"

  "github.com/openai/openai-go"
  "github.com/openai/openai-go/option"
)

func main() {
  client := openai.NewClient(
    option.WithAPIKey("dgx_sk_your_key_here"),
    option.WithBaseURL("${baseUrl}/v1"),
  )

  response, _ := client.Chat.Completions.New(context.TODO(), openai.ChatCompletionNewParams{
    Model: "qwen3.6:35b-a3b",
    Messages: []openai.ChatCompletionMessageParamUnion{
      openai.UserMessage("Explain how AI works in a few words"),
    },
  })

  fmt.Println(response.Choices[0].Message.Content)
}`,
  Java: `OpenAIClient client = OpenAIOkHttpClient.builder()
    .apiKey("dgx_sk_your_key_here")
    .baseUrl("${baseUrl}/v1")
    .build();

ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
    .model("qwen3.6:35b-a3b")
    .addUserMessage("Explain how AI works in a few words")
    .build();

ChatCompletion response = client.chat().completions().create(params);
System.out.println(response.choices().get(0).message().content().orElse(""));`,
  "C#": `using OpenAI.Chat;

ChatClient client = new(
    model: "qwen3.6:35b-a3b",
    credential: new ApiKeyCredential("dgx_sk_your_key_here"),
    options: new OpenAIClientOptions
    {
        Endpoint = new Uri("${baseUrl}/v1")
    }
);

ChatCompletion response = client.CompleteChat(
    "Explain how AI works in a few words"
);

Console.WriteLine(response.Content[0].Text);`,
  REST: chatSnippets.REST,
};

type QuickstartLanguage = keyof typeof quickstartSnippets;
type GuideLanguage = "Python" | "JavaScript" | "REST";

export function DocsView() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<QuickstartLanguage>("Python");
  const [chatLang, setChatLang] = useState<GuideLanguage>("Python");
  const [streamLang, setStreamLang] = useState<GuideLanguage>("Python");
  const [visionLang, setVisionLang] = useState<GuideLanguage>("Python");
  const [embedLang, setEmbedLang] = useState<GuideLanguage>("Python");
  const [toolsLang, setToolsLang] = useState<"Python" | "JavaScript">("Python");
  const [structuredLang, setStructuredLang] = useState<"Python" | "JavaScript">("Python");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [peekGroup, setPeekGroup] = useState<NavGroupId | null>(null);

  const activeSnippet = quickstartSnippets[activeLanguage];
  const languages = useMemo(() => Object.keys(quickstartSnippets) as QuickstartLanguage[], []);
  const activeGroup = groupIdForSection(activeSection);

  useEffect(() => {
    setActiveSection(initialSectionId());
  }, []);

  useEffect(() => {
    const nodes = allSectionIds
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio);
          } else {
            visible.delete(entry.target.id);
          }
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const id of allSectionIds) {
          const ratio = visible.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId) {
          setActiveSection(bestId);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5, 1] },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch("/api/models", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.models && Array.isArray(data.models)) {
          setModels(data.models.map((m: { name: string }) => m.name));
        } else if (data.error === "OFFLINE") {
          setModelsError(data.message || "DGX Spark is unreachable.");
        } else {
          setModelsError("Failed to fetch models list.");
        }
      })
      .catch(() => {
        setModelsError("Failed to fetch models list.");
      })
      .finally(() => setLoadingModels(false));
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const isGroupOpen = (groupId: NavGroupId) => groupId === activeGroup || groupId === peekGroup;

  const toggleGroup = (groupId: NavGroupId) => {
    if (groupId === activeGroup) return;
    setPeekGroup((prev) => (prev === groupId ? null : groupId));
  };

  const handleSectionClick = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault();
    setActiveSection(sectionId);
    setPeekGroup(null);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${sectionId}`);
  };

  useEffect(() => {
    setPeekGroup((prev) => (prev && prev === activeGroup ? null : prev));
  }, [activeGroup]);

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <nav className="border border-border bg-panel rounded-lg p-2 space-y-1">
          {navGroups.map((group) => {
            const open = isGroupOpen(group.id);
            const isActiveGroup = group.id === activeGroup;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold uppercase transition-colors cursor-pointer ${
                    isActiveGroup
                      ? "text-nvidia-green hover:bg-panel-hover"
                      : "text-foreground/40 hover:bg-panel-hover hover:text-foreground/70"
                  }`}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                  />
                  <span className="min-w-0 flex-1">{group.label}</span>
                </button>
                {open && (
                  <div className="pb-1">
                    {group.items.map((section) => {
                      const active = activeSection === section.id;
                      return (
                        <a
                          key={section.id}
                          href={`#${section.id}`}
                          onClick={(event) => handleSectionClick(event, section.id)}
                          className={`ml-2 flex items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                            active
                              ? "bg-nvidia-green/10 text-nvidia-green"
                              : "text-foreground/65 hover:bg-panel-hover hover:text-foreground"
                          }`}
                        >
                          {section.label}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="space-y-12 min-w-0">
        <DocSection
          id="overview"
          icon={<BookOpen className="h-5 w-5 text-nvidia-green" />}
          title="Overview"
          description="DGX Spark exposes an OpenAI-compatible API at api.dgxspark.dev. Use your dgx_sk_ key for chat, embeddings, tools, and structured JSON. Vision input works on vision models. Image generation, audio, and video stay parked until those models are on Spark."
        >
          <CopyField
            label="Base URL"
            value={`${baseUrl}/v1`}
            copied={copiedText === "base"}
            onCopy={() => handleCopy(`${baseUrl}/v1`, "base")}
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "#quickstart", label: "Quickstart", hint: "First request in minutes" },
              { href: "#chat", label: "Chat completions", hint: "Core text API" },
              { href: "#streaming", label: "Streaming", hint: "Tokens as they generate" },
              { href: "#vision", label: "Vision", hint: "Image understanding" },
              { href: "#tools", label: "Tools & MCP", hint: "Function calling loop" },
              { href: "#embeddings", label: "Embeddings", hint: "Vectors for RAG" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => handleSectionClick(event, link.href.slice(1))}
                className="rounded-lg border border-border bg-panel px-4 py-3 transition-colors hover:border-nvidia-green/40 hover:bg-panel-hover"
              >
                <div className="text-sm font-bold text-foreground">{link.label}</div>
                <div className="mt-1 text-xs text-foreground/45">{link.hint}</div>
              </a>
            ))}
          </div>
        </DocSection>

        <DocSection
          id="quickstart"
          icon={<Code className="h-5 w-5 text-nvidia-green" />}
          title="Quickstart"
          description="Create an API key, point an OpenAI SDK at the Spark base URL, and send a chat completion. Replace the model with one from the live list below."
        >
          <CodeTabs
            languages={languages}
            active={activeLanguage}
            onChange={setActiveLanguage}
            code={activeSnippet}
            copied={copiedText === `quickstart-${activeLanguage}`}
            onCopy={() => handleCopy(activeSnippet, `quickstart-${activeLanguage}`)}
          />
        </DocSection>

        <DocSection
          id="authentication"
          icon={<KeyRound className="h-5 w-5 text-nvidia-green" />}
          title="Authentication"
          description="Create a key from the API Keys page and send it in the Authorization header. Keep the full key private; the dashboard only shows the prefix after creation."
        >
          <CopyField
            label="Header"
            value="Authorization: Bearer dgx_sk_your_key_here"
            copied={copiedText === "auth"}
            onCopy={() => handleCopy("Authorization: Bearer dgx_sk_your_key_here", "auth")}
          />
        </DocSection>

        <DocSection
          id="models"
          icon={<Server className="h-5 w-5 text-nvidia-green" />}
          title="Models"
          description="Pass the model name in every request. Capabilities (vision, tools, embedding, thinking) come from the running Ollama instance — use a model that supports the feature you need."
        >
          {loadingModels ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-panel p-4 text-sm text-foreground/50">
              <span className="h-2 w-2 rounded-full bg-nvidia-green animate-ping" />
              Loading models from Ollama...
            </div>
          ) : modelsError ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
              {modelsError}
            </div>
          ) : models.length === 0 ? (
            <div className="rounded-lg border border-border bg-panel p-4 text-sm text-foreground/50">
              No models currently active.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {models.map((modelName) => (
                <button
                  key={modelName}
                  onClick={() => handleCopy(modelName, `model-${modelName}`)}
                  className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-mono font-semibold text-foreground/75 hover:border-nvidia-green/45 hover:text-foreground transition-colors cursor-pointer"
                  title="Copy model name"
                >
                  {modelName}
                  {copiedText === `model-${modelName}` && (
                    <span className="ml-2 text-xs font-bold font-sans text-nvidia-green">Copied</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </DocSection>

        <DocSection
          id="chat"
          icon={<MessageSquare className="h-5 w-5 text-nvidia-green" />}
          title="Chat completions"
          description="By default the API waits until the model finishes, then returns one JSON response. Send POST /v1/chat/completions with a model and a messages array."
        >
          <GuideSteps
            steps={[
              {
                title: "Endpoint",
                body: "POST /v1/chat/completions — OpenAI-compatible chat body.",
              },
              {
                title: "Messages",
                body: "Use role/content pairs: system, user, and assistant. content can be a string, or an array of parts for vision and files.",
              },
              {
                title: "Files",
                body: "Inline UTF-8 text via type file + file_data. Image files are treated as vision. file_id uploads are not stored — there is no Files API.",
              },
            ]}
          />
          <div className="mt-4">
            <CodeTabs
              languages={["Python", "JavaScript", "REST"]}
              active={chatLang}
              onChange={setChatLang}
              code={chatSnippets[chatLang]}
              copied={copiedText === `chat-${chatLang}`}
              onCopy={() => handleCopy(chatSnippets[chatLang], `chat-${chatLang}`)}
            />
          </div>
        </DocSection>

        <DocSection
          id="streaming"
          icon={<Radio className="h-5 w-5 text-nvidia-green" />}
          title="Streaming"
          description="Long responses can take time if you wait for the full completion. Set stream to true to receive tokens over server-sent events as they are generated — same pattern as OpenAI HTTP streaming."
        >
          <GuideSteps
            steps={[
              {
                title: "Enable streaming",
                body: "Pass stream: true (or stream=True in Python). The SDK yields chat.completion.chunk objects.",
              },
              {
                title: "Read deltas",
                body: "Each chunk may include choices[0].delta.content. Concatenate deltas to rebuild the assistant message.",
              },
              {
                title: "Usage",
                body: "Usage is recorded when the stream completes. Failed authenticated streams are logged too.",
              },
            ]}
          />
          <div className="mt-4">
            <CodeTabs
              languages={["Python", "JavaScript", "REST"]}
              active={streamLang}
              onChange={setStreamLang}
              code={streamingSnippets[streamLang]}
              copied={copiedText === `stream-${streamLang}`}
              onCopy={() => handleCopy(streamingSnippets[streamLang], `stream-${streamLang}`)}
            />
          </div>
          <Callout>
            Use curl -N (or an SSE-aware client) so the connection stays open while chunks arrive.
          </Callout>
        </DocSection>

        <DocSection
          id="vision"
          icon={<Eye className="h-5 w-5 text-nvidia-green" />}
          title="Vision"
          description="On models with the vision capability, send images as OpenAI content parts. This is image understanding — describe, OCR, answer questions about a photo — not image generation."
        >
          <GuideSteps
            steps={[
              {
                title: "Content parts",
                body: 'Use type "text" plus type "image_url". The url may be a data URL, raw base64, or an http(s) URL.',
              },
              {
                title: "Capability gate",
                body: "Only models that advertise vision accept images. Chat-only models reject image parts.",
              },
            ]}
          />
          <div className="mt-4">
            <CodeTabs
              languages={["Python", "JavaScript", "REST"]}
              active={visionLang}
              onChange={setVisionLang}
              code={visionSnippets[visionLang]}
              copied={copiedText === `vision-${visionLang}`}
              onCopy={() => handleCopy(visionSnippets[visionLang], `vision-${visionLang}`)}
            />
          </div>
          <Callout>
            Image generation, edits, and video endpoints are not live yet. See Roadmap.
          </Callout>
        </DocSection>

        <DocSection
          id="embeddings"
          icon={<BrainCircuit className="h-5 w-5 text-nvidia-green" />}
          title="Embeddings"
          description="Turn text into vectors for search, clustering, and RAG. Call POST /v1/embeddings with an embedding model such as nomic-embed-text:latest. Chat and vision models reject embed requests."
        >
          <GuideSteps
            steps={[
              {
                title: "Endpoint",
                body: "POST /v1/embeddings with model and input (string or string array).",
              },
              {
                title: "Response",
                body: "OpenAI-shaped data[].embedding float vectors, one per input. Token-id arrays are not supported.",
              },
            ]}
          />
          <div className="mt-4">
            <CodeTabs
              languages={["Python", "JavaScript", "REST"]}
              active={embedLang}
              onChange={setEmbedLang}
              code={embeddingsSnippets[embedLang]}
              copied={copiedText === `embed-${embedLang}`}
              onCopy={() => handleCopy(embeddingsSnippets[embedLang], `embed-${embedLang}`)}
            />
          </div>
        </DocSection>

        <DocSection
          id="tools"
          icon={<Wrench className="h-5 w-5 text-nvidia-green" />}
          title="Tools & MCP"
          description="Function calling works on models with the tools capability. You send tools[], the model may return tool_calls, your app runs the tools, then you continue the chat with role=tool messages. There is no hosted web search, code interpreter, or MCP bridge on the gateway."
        >
          <GuideSteps
            steps={[
              {
                title: "Define tools",
                body: "Pass OpenAI function definitions in tools. Omit tool_choice — Ollama does not support it yet.",
              },
              {
                title: "Run the loop",
                body: "Your client executes each tool_call and appends role=tool results, then calls chat completions again.",
              },
              {
                title: "MCP",
                body: "Keep MCP in your process: list_tools → tools[], then tools/call when the model asks. The Spark API only sees OpenAI tool shapes.",
              },
            ]}
          />
          <div className="mt-4">
            <CodeTabs
              languages={["Python", "JavaScript"]}
              active={toolsLang}
              onChange={setToolsLang}
              code={toolsSnippets[toolsLang]}
              copied={copiedText === `tools-${toolsLang}`}
              onCopy={() => handleCopy(toolsSnippets[toolsLang], `tools-${toolsLang}`)}
            />
          </div>
          <Callout>
            Do not send MCP wire protocol to /v1/chat/completions — map tools on the client first.
          </Callout>
        </DocSection>

        <DocSection
          id="structured"
          icon={<Code className="h-5 w-5 text-nvidia-green" />}
          title="Structured output"
          description="Ask for JSON with response_format. json_object enables JSON mode. json_schema is mapped by the gateway into Ollama’s format field so the model returns schema-shaped JSON."
        >
          <GuideSteps
            steps={[
              {
                title: "JSON mode",
                body: 'response_format: { "type": "json_object" }',
              },
              {
                title: "JSON schema",
                body: "type json_schema plus json_schema.schema. Still tell the model to answer in JSON in the prompt.",
              },
            ]}
          />
          <div className="mt-4">
            <CodeTabs
              languages={["Python", "JavaScript"]}
              active={structuredLang}
              onChange={setStructuredLang}
              code={structuredSnippets[structuredLang]}
              copied={copiedText === `structured-${structuredLang}`}
              onCopy={() => handleCopy(structuredSnippets[structuredLang], `structured-${structuredLang}`)}
            />
          </div>
        </DocSection>

        <DocSection
          id="roadmap"
          icon={<ListChecks className="h-5 w-5 text-nvidia-green" />}
          title="Roadmap"
          description="Image generation, audio endpoints, and video stay parked until matching models are pulled on Spark. Those OpenAI routes 404 on purpose today."
        >
          <GuideSteps
            steps={[
              {
                title: "Live today",
                body: "Chat, streaming, vision-in, thinking (gated), tools/function calling, embeddings, structured JSON.",
              },
              {
                title: "Waiting on models",
                body: "Image generation / edits, audio speech & transcription, video.",
              },
              {
                title: "Not planned as OpenAI clones",
                body: "Assistants, Files store, Batch, Fine-tuning, Realtime WebRTC, Sora.",
              },
            ]}
          />
        </DocSection>

        <DocSection
          id="errors-usage"
          icon={<AlertCircle className="h-5 w-5 text-nvidia-green" />}
          title="Errors & usage"
          description="Successful calls and failed authenticated calls are written to the usage table. Use the usage dashboard for tokens, request count, success rate, and API errors."
        >
          <GuideSteps
            steps={[
              { title: "2xx", body: "Request completed successfully." },
              { title: "4xx", body: "Check the key, payload, model name, capability, or request format." },
              { title: "5xx", body: "The platform or upstream model service failed." },
            ]}
          />
        </DocSection>

        <DocSection
          id="terms"
          icon={<ShieldCheck className="h-5 w-5 text-nvidia-green" />}
          title="T&C"
          description="Use the API only with keys you own, keep credentials private, and do not send data you are not allowed to process. Availability depends on the DGX Spark service and active local models."
        >
          <Callout>
            Usage analytics are for operational visibility. Review generated output before using it in production workflows.
          </Callout>
        </DocSection>
      </div>
    </div>
  );
}

function DocSection({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-nvidia-green/20 bg-nvidia-green/10">
            {icon}
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-foreground/55">{description}</p>
      </div>
      {children}
    </section>
  );
}

function GuideSteps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ul className="space-y-3">
      {steps.map((step) => (
        <li key={step.title}>
          <div className="text-sm font-bold text-foreground">{step.title}</div>
          <p className="mt-1 text-sm leading-6 text-foreground/55">{step.body}</p>
        </li>
      ))}
    </ul>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-panel px-4 py-3 text-sm leading-6 text-foreground/60">
      {children}
    </div>
  );
}

function CodeTabs<T extends string>({
  languages,
  active,
  onChange,
  code,
  copied,
  onCopy,
}: {
  languages: readonly T[] | T[];
  active: T;
  onChange: (lang: T) => void;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex overflow-x-auto border-b border-border bg-panel">
        {languages.map((language) => (
          <button
            key={language}
            type="button"
            onClick={() => onChange(language)}
            className={`relative px-5 py-3.5 text-sm font-bold transition-colors cursor-pointer ${
              active === language ? "text-nvidia-green" : "text-foreground/55 hover:text-foreground"
            }`}
          >
            {language}
            {active === language && (
              <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-nvidia-green" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={onCopy}
          className="ml-auto shrink-0 px-4 text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? <Check className="h-5 w-5 text-nvidia-green" /> : <Copy className="h-5 w-5" />}
        </button>
      </div>
      <pre className="max-h-[520px] overflow-auto bg-background p-6 text-sm leading-7 text-foreground/85 font-mono">
        {code}
      </pre>
    </div>
  );
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-2 text-xs font-bold uppercase text-foreground/40">{label}</div>
      <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-3">
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-nvidia-green">{value}</code>
        <button
          onClick={onCopy}
          className="shrink-0 rounded-md border border-border bg-panel p-2 text-foreground/55 hover:bg-panel-hover hover:text-foreground transition-colors cursor-pointer"
          title={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-nvidia-green" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
