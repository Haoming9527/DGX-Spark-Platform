import { NextRequest, NextResponse } from "next/server";
import { gatewayAuthHeaders } from "../../../lib/inferenceGateway";
import { inferenceKeyForAccount } from "../../../lib/inferenceKey";
import { loadOptionalAccount } from "../../../lib/requireAccount";
import { clearSessionCookie } from "../../../lib/auth";
import { clientKey, takeRateLimit } from "../../../lib/rateLimit";
import { apiFailure, readJsonBody } from "../../../lib/apiRequest";

export const dynamic = "force-dynamic";

function reply(res: Response, clearCookie: boolean) {
  const out = new NextResponse(res.body, { status: res.status, headers: res.headers });
  if (clearCookie) clearSessionCookie(out);
  return out;
}

export async function POST(req: NextRequest) {
  let clearCookie = false;
  try {
    const optional = await loadOptionalAccount(req);
    clearCookie = optional.clearCookie;
    const account = optional.account;
    const ip = clientKey(req);
    const overLimit = account
      ? !await takeRateLimit(`chat:${account.id}`, { limit: 30, windowMs: 60_000 })
      : !await takeRateLimit(`chat-anon:${ip}`, { limit: 5, windowMs: 60_000 }) ||
        !await takeRateLimit(`chat-anon-hour:${ip}`, { limit: 15, windowMs: 60 * 60 * 1000 });
    if (overLimit) {
      return reply(NextResponse.json({ error: "Too many requests." }, { status: 429 }), clearCookie);
    }

    const { messages, model, useReasoning } = await readJsonBody(req, 48 * 1024 * 1024);
    const { base, apiKey } = inferenceKeyForAccount(account);

    const payload: Record<string, unknown> = {
      model: model || "qwen3.6:35b-a3b",
      messages,
      stream: true,
    };
    if (typeof useReasoning === "boolean" && !/(?:^|\/)gpt[-_]?oss(?:[:/-]|$)/i.test(String(payload.model))) {
      payload.think = useReasoning;
    }

    const response = await fetch(`${base}/olla/ollama/api/chat`, {
      method: "POST",
      headers: gatewayAuthHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(180000)]),
    });

    if (!response.ok) {
      const upstream = await response.text();
      const jsonHeaders = { "Content-Type": "application/json" };
      if ([530, 502, 401].includes(response.status)) {
        return reply(
          new Response(
            JSON.stringify({ error: "OFFLINE", message: "DGX Spark gateway is currently unavailable." }),
            { status: 200, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      if (
        response.status === 503 ||
        /NO_ENDPOINTS|no healthy endpoints|service_unavailable/i.test(upstream)
      ) {
        return reply(
          new Response(
            JSON.stringify({ error: "SLEEPING", message: "No AI servers are online." }),
            { status: 200, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      if (response.status === 404 || /model ['"][^'"]+['"] not found/i.test(upstream) || /model not found/i.test(upstream)) {
        return reply(
          new Response(
            JSON.stringify({
              error: "MODEL_UNAVAILABLE",
              message: "That model is not available. Choose another model.",
            }),
            { status: 200, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      if (response.status === 400 && /does not support thinking/i.test(upstream)) {
        return reply(
          new Response(
            JSON.stringify({
              error: "MODEL_CAPABILITY",
              capability: "thinking",
              message: "This model does not support thinking. Turn it off or pick another model.",
            }),
            { status: 200, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      if (response.status === 400 && /does not support (images|vision)/i.test(upstream)) {
        return reply(
          new Response(
            JSON.stringify({
              error: "MODEL_CAPABILITY",
              capability: "vision",
              message: "This model does not accept images. Remove attachments or pick a vision model.",
            }),
            { status: 200, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      console.error(`Gateway Error: ${response.status}`);
      return reply(
        new Response(
          JSON.stringify({
            error: "UPSTREAM",
            message: "The model request failed. Try again or pick another model.",
          }),
          { status: 200, headers: jsonHeaders }
        ),
        clearCookie
      );
    }

    return reply(
      new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }),
      clearCookie
    );
  } catch (error: unknown) {
    return reply(apiFailure(error, "Chat request failed:"), clearCookie);
  }
}
