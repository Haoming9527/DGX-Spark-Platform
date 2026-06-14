"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, Check, ChevronRight, Code, Copy, KeyRound, ListChecks, Server, ShieldCheck, Terminal } from "lucide-react";

const baseUrl = "https://www.dgxspark.dev";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quickstart" },
  { id: "authentication", label: "Authentication" },
  { id: "models", label: "Models" },
  { id: "requests", label: "Requests" },
  { id: "errors-usage", label: "Errors & usage" },
  { id: "terms", label: "T&C" },
];

const quickstartSnippets = {
  Python: `from openai import OpenAI

client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1",
)

response = client.chat.completions.create(
    model="llama3.1:8b",
    messages=[
        {"role": "user", "content": "Explain how AI works in a few words"}
    ],
)

print(response.choices[0].message.content)`,
  JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1",
});

const response = await client.chat.completions.create({
  model: "llama3.1:8b",
  messages: [
    { role: "user", content: "Explain how AI works in a few words" },
  ],
});

console.log(response.choices[0].message.content);`,
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
    Model: "llama3.1:8b",
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
    .model("llama3.1:8b")
    .addUserMessage("Explain how AI works in a few words")
    .build();

ChatCompletion response = client.chat().completions().create(params);
System.out.println(response.choices().get(0).message().content().orElse(""));`,
  "C#": `using OpenAI.Chat;

ChatClient client = new(
    model: "llama3.1:8b",
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
  REST: `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama3.1:8b",
    "messages": [
      {
        "role": "user",
        "content": "Explain how AI works in a few words"
      }
    ]
  }'`,
};

type QuickstartLanguage = keyof typeof quickstartSnippets;

export function DocsView() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<QuickstartLanguage>("Python");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const activeSnippet = quickstartSnippets[activeLanguage];
  const languages = useMemo(() => Object.keys(quickstartSnippets) as QuickstartLanguage[], []);

  useEffect(() => {
    fetch("/api/models")
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

  const handleSectionClick = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault();
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${sectionId}`);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <nav className="border border-border bg-panel rounded-lg p-2">
          <div className="px-3 py-2 text-xs font-bold uppercase text-foreground/40">Docs</div>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => handleSectionClick(event, section.id)}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-foreground/65 hover:bg-panel-hover hover:text-foreground transition-colors"
            >
              {section.label}
              <ChevronRight className="h-3.5 w-3.5 text-foreground/30" />
            </a>
          ))}
        </nav>
      </aside>

      <div className="space-y-10 min-w-0">
        <DocSection
          id="overview"
          icon={<BookOpen className="h-5 w-5 text-nvidia-green" />}
          title="Overview"
          description="DGX Spark exposes an OpenAI-compatible chat completions API. Use it with your API key, choose an active model, and send chat messages to the /v1 endpoint."
        >
          <CopyField
            label="Base URL"
            value={`${baseUrl}/v1`}
            copied={copiedText === "base"}
            onCopy={() => handleCopy(`${baseUrl}/v1`, "base")}
          />
        </DocSection>

        <DocSection
          id="quickstart"
          icon={<Code className="h-5 w-5 text-nvidia-green" />}
          title="Quickstart"
          description="Pick the language you use, paste your API key, and replace the model with one from the supported model list."
        >
          <div className="overflow-hidden rounded-lg border border-border bg-panel">
            <div className="flex overflow-x-auto border-b border-border bg-panel">
              {languages.map((language) => (
                <button
                  key={language}
                  onClick={() => setActiveLanguage(language)}
                  className={`relative px-5 py-4 text-sm font-bold transition-colors cursor-pointer ${
                    activeLanguage === language
                      ? "text-nvidia-green"
                      : "text-foreground/55 hover:text-foreground"
                  }`}
                >
                  {language}
                  {activeLanguage === language && (
                    <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-nvidia-green" />
                  )}
                </button>
              ))}
              <button
                onClick={() => handleCopy(activeSnippet, `quickstart-${activeLanguage}`)}
                className="ml-auto shrink-0 px-4 text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                title="Copy quickstart code"
              >
                {copiedText === `quickstart-${activeLanguage}` ? (
                  <Check className="h-5 w-5 text-nvidia-green" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </button>
            </div>
            <pre className="max-h-[520px] overflow-auto bg-background p-6 text-sm leading-7 text-foreground/85 font-mono">
              {activeSnippet}
            </pre>
          </div>
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
          description="Use the model field to choose which local model should answer the request. The list below is loaded from the running DGX Spark model endpoint."
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
          id="requests"
          icon={<Terminal className="h-5 w-5 text-nvidia-green" />}
          title="Requests"
          description="Send POST requests to /v1/chat/completions with a model and messages array. Set stream to true when your client wants tokens as they are generated."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard title="Endpoint" body="POST /v1/chat/completions" />
            <InfoCard title="Messages" body="Use role/content pairs such as system, user, and assistant." />
            <InfoCard title="Streaming" body="Enable stream: true for server-sent event chunks." />
            <InfoCard title="Usage" body="Usage is recorded when the API call finishes or when a stream completes." />
          </div>
        </DocSection>

        <DocSection
          id="errors-usage"
          icon={<AlertCircle className="h-5 w-5 text-nvidia-green" />}
          title="Errors & usage"
          description="Successful calls and failed authenticated calls are written to the usage table. Use the usage dashboard to review tokens, request count, success rate, and API errors."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoCard title="2xx" body="Request completed successfully." />
            <InfoCard title="4xx" body="Check the key, payload, model name, or request format." />
            <InfoCard title="5xx" body="The platform or upstream model service failed." />
          </div>
        </DocSection>

        <DocSection
          id="terms"
          icon={<ShieldCheck className="h-5 w-5 text-nvidia-green" />}
          title="T&C"
          description="Use the API only with keys you own, keep credentials private, and do not send data you are not allowed to process. Availability depends on the DGX Spark service and active local models."
        >
          <div className="rounded-lg border border-border bg-panel p-4 text-sm text-foreground/60">
            <div className="flex items-start gap-3">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-nvidia-green" />
              <p>
                Usage analytics are provided for operational visibility. You are responsible for reviewing generated output before using it in production workflows.
              </p>
            </div>
          </div>
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

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-sm font-bold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-foreground/55">{body}</p>
    </div>
  );
}
