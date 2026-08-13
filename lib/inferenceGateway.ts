export function getInferenceGatewayBase(): string | null {
  const raw = process.env.INFERENCE_GATEWAY_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function requireInferenceGateway(): { base: string; apiKey: string } {
  const base = getInferenceGatewayBase();
  const apiKey = process.env.INFERENCE_GATEWAY_API_KEY?.trim() || "";
  if (!base || !apiKey) {
    throw new Error(
      "INFERENCE_GATEWAY_URL and INFERENCE_GATEWAY_API_KEY must be set (point at api.dgxspark.dev with a dgx_sk_ key)."
    );
  }
  return { base, apiKey };
}

export function gatewayAuthHeaders(apiKey: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${apiKey}`);
  return headers;
}
