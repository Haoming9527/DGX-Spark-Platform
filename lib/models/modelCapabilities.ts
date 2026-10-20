export function isDecisionModel(capabilities?: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.some((capability) =>
    typeof capability === "string" && capability.trim().toLowerCase() === "decision");
}

export type CapabilityInfo = { label: string; description: string; guide?: string; endpoint?: string };

// Ollama capability names mapped to developer-facing labels. Unknown capabilities are shown as reported.
const CAPABILITIES: Record<string, CapabilityInfo> = {
  completion: { label: "Chat", description: "Generates text in chat completions.", guide: "chat", endpoint: "/v1/chat/completions" },
  vision: { label: "Vision", description: "Accepts images as image_url content parts.", guide: "vision" },
  tools: { label: "Tools", description: "Can return tool_calls for function calling.", guide: "tools" },
  thinking: { label: "Thinking", description: "Can reason before answering; control it with reasoning_effort." },
  embedding: { label: "Embeddings", description: "Returns vectors from /v1/embeddings.", guide: "embeddings", endpoint: "/v1/embeddings" },
  decision: { label: "Decision", description: "Makes typed decisions with /v1/systemone; not a chat model.", guide: "systemone", endpoint: "/v1/systemone" },
  audio: { label: "Audio", description: "Accepts audio input." },
};

export const CAPABILITY_ORDER = Object.keys(CAPABILITIES);

export function capabilityInfo(capability: string): CapabilityInfo {
  return CAPABILITIES[capability] ?? { label: capability.charAt(0).toUpperCase() + capability.slice(1), description: `Reports the "${capability}" capability.` };
}
