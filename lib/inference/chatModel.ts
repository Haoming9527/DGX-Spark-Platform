import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type { Account } from "../auth/account";
import type { ThinkingControl } from "../models/modelThinking";
import { inferenceKeyForAccount } from "./inferenceKey";

export const PROVIDER = "dgxspark";

// The gateway's public OpenAI-compatible API (INFERENCE_GATEWAY_URL, e.g. https://api.dgxspark.dev/v1).
export function chatModel(account: Account | null, model: string) {
  const { base, apiKey } = inferenceKeyForAccount(account);
  const provider = createOpenAICompatible({
    name: PROVIDER,
    baseURL: `${base}/v1`,
    headers: { Authorization: `Bearer ${apiKey}` },
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
  // Models without a native thinking parser emit tagged reasoning inside the text; move it into reasoning parts.
  // Kimi models use ◁think▷ … ◁/think▷ instead of XML-style tags.
  const tags = ["think", "thinking", { opening: "◁think▷", closing: "◁/think▷" }];
  return wrapLanguageModel({
    model: provider(model),
    middleware: tags.map(tagName => extractReasoningMiddleware({ tagName })),
  });
}

// Ollama's /v1 maps reasoning_effort onto each model's thinking levels; "none" turns thinking off.
export function reasoningOptions(control: ThinkingControl) {
  const effort = typeof control === "string" ? control : control === true ? "medium" : control === false ? "none" : undefined;
  return effort ? { [PROVIDER]: { reasoningEffort: effort } } : undefined;
}
