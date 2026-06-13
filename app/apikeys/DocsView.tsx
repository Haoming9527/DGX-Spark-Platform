"use client";

import { useState, useEffect } from "react";
import { Terminal, Copy, Check, Code, BookOpen } from "lucide-react";

export function DocsView() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const baseUrl = "https://www.dgxspark.dev";

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (data.models && Array.isArray(data.models)) {
          setModels(data.models.map((m: any) => m.name));
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

  const curlCode = `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama3.1:8b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`;

  const pythonCode = `from openai import OpenAI

# Initialize the official OpenAI client pointing to our platform
client = OpenAI(
    api_key="dgx_sk_your_key_here",
    base_url="${baseUrl}/v1"
)

response = client.chat.completions.create(
    model="llama3.1:8b",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in response:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)`;

  const nodeCode = `import OpenAI from "openai";

// Initialize the official OpenAI client pointing to our platform
const openai = new OpenAI({
  apiKey: "dgx_sk_your_key_here",
  baseURL: "${baseUrl}/v1"
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: "llama3.1:8b",
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

main();`;

  return (
    <div className="space-y-6">
      {/* Base URL info */}
      <div className="bg-panel border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Terminal className="w-4 h-4 text-nvidia-green" /> Service API Base URL
        </h3>
        <p className="text-xs text-foreground/50">
          Configure your local agents, tools, or integrations by pointing their target server base URL here.
        </p>
        <div className="flex items-center gap-2 bg-background border border-border/60 rounded-lg p-2.5">
          <code className="flex-1 text-xs font-mono text-nvidia-green break-all pl-1">
            {baseUrl}/v1
          </code>
          <button
            onClick={() => handleCopy(`${baseUrl}/v1`, "base")}
            className="shrink-0 p-2 bg-panel hover:bg-panel-hover border border-border rounded-md text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            title="Copy Base URL"
          >
            {copiedText === "base" ? <Check className="w-4 h-4 text-nvidia-green" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Supported Models Section */}
      <div className="bg-panel border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-nvidia-green" /> Supported Models
        </h3>
        <p className="text-xs text-foreground/50">
          Pass any of these active model identifiers in your API requests payload. Click to copy.
        </p>

        {loadingModels ? (
          <div className="flex items-center gap-2 text-xs text-foreground/45 py-2 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-nvidia-green animate-ping" />
            Loading models from Ollama...
          </div>
        ) : modelsError ? (
          <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg p-3">
            {modelsError}
          </div>
        ) : models.length === 0 ? (
          <div className="text-xs text-foreground/45">
            No models currently active.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {models.map((modelName) => (
              <span
                key={modelName}
                className="px-2.5 py-1 text-xs font-semibold font-mono bg-background border border-border/80 rounded-md hover:border-nvidia-green/45 transition-colors text-foreground/80 cursor-pointer flex items-center gap-1.5"
                onClick={() => handleCopy(modelName, `model-${modelName}`)}
                title="Click to copy model name"
              >
                {modelName}
                {copiedText === `model-${modelName}` && (
                  <span className="text-[10px] text-nvidia-green font-sans font-bold">✓ Copied</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Code Examples */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 pl-1">
          <Code className="w-4 h-4 text-nvidia-green" /> Integration Snippets
        </h3>

        {/* Curl */}
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-panel-hover/30">
            <span className="text-xs font-bold text-foreground/70 font-mono">cURL Request</span>
            <button
              onClick={() => handleCopy(curlCode, "curl")}
              className="text-foreground/50 hover:text-foreground text-xs flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              {copiedText === "curl" ? <Check className="w-3.5 h-3.5 text-nvidia-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedText === "curl" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="p-4 bg-background text-xs text-foreground/80 font-mono overflow-x-auto leading-relaxed">
            {curlCode}
          </pre>
        </div>

        {/* Python */}
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-panel-hover/30">
            <span className="text-xs font-bold text-foreground/70 font-mono">Python (openai package)</span>
            <button
              onClick={() => handleCopy(pythonCode, "python")}
              className="text-foreground/50 hover:text-foreground text-xs flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              {copiedText === "python" ? <Check className="w-3.5 h-3.5 text-nvidia-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedText === "python" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="p-4 bg-background text-xs text-foreground/80 font-mono overflow-x-auto leading-relaxed">
            {pythonCode}
          </pre>
        </div>

        {/* Node.js */}
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-panel-hover/30">
            <span className="text-xs font-bold text-foreground/70 font-mono">Node.js (openai npm)</span>
            <button
              onClick={() => handleCopy(nodeCode, "node")}
              className="text-foreground/50 hover:text-foreground text-xs flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              {copiedText === "node" ? <Check className="w-3.5 h-3.5 text-nvidia-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedText === "node" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="p-4 bg-background text-xs text-foreground/80 font-mono overflow-x-auto leading-relaxed">
            {nodeCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
