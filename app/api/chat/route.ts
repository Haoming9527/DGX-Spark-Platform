import { NextRequest } from "next/server";
import { gatewayAuthHeaders, requireInferenceGateway } from "../../../lib/inferenceGateway";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { messages, model, useReasoning } = await req.json();
    const { base, apiKey } = requireInferenceGateway();

    const payload: Record<string, unknown> = {
      model: model || "qwen3.6:35b-a3b",
      messages,
      stream: true,
    };
    if (useReasoning === true) {
      payload.think = true;
    }

    const response = await fetch(`${base}/olla/ollama/api/chat`, {
      method: "POST",
      headers: gatewayAuthHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const upstream = await response.text();
      const jsonHeaders = { "Content-Type": "application/json" };
      if ([530, 502, 401].includes(response.status)) {
        return new Response(
          JSON.stringify({ error: "OFFLINE", message: "DGX Spark gateway is currently unavailable." }),
          { status: 200, headers: jsonHeaders }
        );
      }
      if (
        response.status === 503 ||
        /NO_ENDPOINTS|no healthy endpoints|service_unavailable/i.test(upstream)
      ) {
        return new Response(
          JSON.stringify({ error: "SLEEPING", message: "No AI servers are online." }),
          { status: 200, headers: jsonHeaders }
        );
      }
      if (response.status === 404 || /model ['"][^'"]+['"] not found/i.test(upstream)) {
        const named =
          upstream.match(/model ['"]([^'"]+)['"]/i)?.[1] || model || "that model";
        return new Response(
          JSON.stringify({
            error: "MODEL_UNAVAILABLE",
            message: `${named} is not installed on DGX Spark. Choose another model.`,
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
      if (response.status === 400 && /does not support thinking/i.test(upstream)) {
        return new Response(
          JSON.stringify({
            error: "MODEL_CAPABILITY",
            capability: "thinking",
            message: `${model || "This model"} does not support thinking. Turn it off or pick another model.`,
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
      if (response.status === 400 && /does not support (images|vision)/i.test(upstream)) {
        return new Response(
          JSON.stringify({
            error: "MODEL_CAPABILITY",
            capability: "vision",
            message: `${model || "This model"} does not accept images. Remove attachments or pick a vision model.`,
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
      console.error(`Gateway Error: ${response.status}`, upstream);
      return new Response(
        JSON.stringify({
          error: "UPSTREAM",
          message: "The model request failed. Try again or pick another model.",
        }),
        { status: 200, headers: jsonHeaders }
      );
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
