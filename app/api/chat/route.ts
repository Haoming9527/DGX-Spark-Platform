import { NextRequest } from "next/server";
import { gatewayAuthHeaders, requireInferenceGateway } from "../../../lib/inferenceGateway";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { messages, model, useReasoning } = await req.json();
    const { base, apiKey } = requireInferenceGateway();

    const response = await fetch(`${base}/olla/ollama/api/chat`, {
      method: "POST",
      headers: gatewayAuthHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: model || "qwen3.6:35b-a3b",
        messages,
        stream: true,
        think: Boolean(useReasoning),
      }),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const upstream = await response.text();
      if ([530, 502, 401].includes(response.status)) {
        return new Response(
          JSON.stringify({ error: "OFFLINE", message: "DGX Spark gateway is currently unavailable." }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (
        response.status === 503 ||
        /NO_ENDPOINTS|no healthy endpoints|service_unavailable/i.test(upstream)
      ) {
        return new Response(
          JSON.stringify({ error: "SLEEPING", message: "No AI servers are online." }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      console.error(`Gateway Error: ${response.status}`, upstream);
      return new Response(`Error from upstream: ${response.statusText}`, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("API Route Error:", errorMsg);
    return new Response(errorMsg, { status: 500 });
  }
}
