export function getInferenceGatewayBase(): string | null {
  const raw = process.env.INFERENCE_GATEWAY_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function requireInferenceGateway(): { base: string; apiKey: string; adminKey: string } {
  const base = getInferenceGatewayBase();
  const apiKey = process.env.INFERENCE_GATEWAY_API_KEY?.trim() || "";
  const adminKey = process.env.INFERENCE_GATEWAY_ADMIN_KEY?.trim() || "";
  if (!base || !apiKey) {
    throw new Error(
      "INFERENCE_GATEWAY_URL and INFERENCE_GATEWAY_API_KEY must be set (CHAT_SERVICE_KEY, not a user dgx_sk_ key).",
    );
  }
  if (adminKey && adminKey === apiKey) {
    throw new Error("INFERENCE_GATEWAY_ADMIN_KEY must differ from INFERENCE_GATEWAY_API_KEY.");
  }
  return { base, apiKey, adminKey };
}

export function gatewayAuthHeaders(apiKey: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${apiKey}`);
  return headers;
}
