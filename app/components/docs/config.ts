export const baseUrl = "https://api.dgxspark.dev";
export const apiBase = `${baseUrl}/v1`;
export const keyPlaceholder = "dgx_sk_your_key_here";

export type Endpoint = {
  method: "GET" | "POST";
  path: string;
  purpose: string;
  capability?: string;
  guide?: string;
};

export const endpoints: Endpoint[] = [
  { method: "GET", path: "/v1/models", purpose: "List the models your key can use, with their capabilities." },
  { method: "POST", path: "/v1/chat/completions", purpose: "Chat, streaming, vision, tools and structured JSON.", capability: "completion", guide: "chat" },
  { method: "POST", path: "/v1/completions", purpose: "Legacy: plain text completion from a single prompt string. No messages, images, tools or JSON mode; use chat completions for new code.", capability: "completion", guide: "chat" },
  { method: "POST", path: "/v1/embeddings", purpose: "Vectors for search, clustering and RAG.", capability: "embedding", guide: "embeddings" },
  { method: "POST", path: "/v1/systemone", purpose: "Typed decisions: choice, probability and score.", capability: "decision", guide: "systemone" },
];

export const endpointUrl = (path: string) => `${baseUrl}${path}`;
