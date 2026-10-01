import { NextRequest, NextResponse } from "next/server";
import { gatewayAuthHeaders } from "../../../lib/inferenceGateway";
import { inferenceKeyForAccount } from "../../../lib/inferenceKey";
import { loadOptionalAccount } from "../../../lib/requireAccount";
import { clearSessionCookie } from "../../../lib/auth";
import { clientKey, takeRateLimit } from "../../../lib/rateLimit";
import { ApiRequestError, apiFailure, readJsonBody } from "../../../lib/apiRequest";
import { WEB_SEARCH_TOOL } from "../../../lib/webSearchTool";
import { harnessBudget, harnessClock, harnessPhasePrompt, PLAN_SCHEMA, REVIEW_SCHEMA, FOLLOW_UP_SCHEMA } from "../../../lib/chatHarness";
import { compactMessages, ContextBudgetError, estimateContextUnits, type ContextMessage } from "../../../lib/harnessContext";
import { selectThinkingControl } from "../../../lib/modelThinking";

export const dynamic = "force-dynamic";

function reply(res: Response, clearCookie: boolean) {
  const out = new NextResponse(res.body, { status: res.status, headers: res.headers });
  if (clearCookie) clearSessionCookie(out);
  return out;
}

async function readUpstreamError(response: Response, requestSignal: AbortSignal) {
  if (!response.body) return "";
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(3000)]);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!signal.aborted && size < 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, 8192 - size);
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } catch {} finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks, size).toString("utf8");
  try {
    const data = JSON.parse(text);
    if (typeof data.error === "string") return data.error;
    if (typeof data.error?.message === "string") return data.error.message;
    if (typeof data.message === "string") return data.message;
  } catch {}
  return text;
}

function chatTools(value: unknown) {
  if (!Array.isArray(value) || value.length > 48) {
    throw new ApiRequestError(400, "Provide at most 48 function tools.");
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 64 * 1024) {
    throw new ApiRequestError(413, "Tool definitions exceed 64 KiB. Select fewer MCP servers.");
  }
  const names = new Set<string>();
  return value.map((tool) => {
    const fn = tool?.function;
    if (tool?.type !== "function" || !fn || typeof fn !== "object" || Array.isArray(fn) ||
      typeof fn.name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(fn.name) || names.has(fn.name) ||
      (fn.description !== undefined && (typeof fn.description !== "string" || fn.description.length > 2048)) ||
      !fn.parameters || typeof fn.parameters !== "object" || Array.isArray(fn.parameters) || fn.parameters.type !== "object") {
      throw new ApiRequestError(400, "Invalid function tool definition.");
    }
    names.add(fn.name);
    return { type: "function", function: { name: fn.name, description: fn.description, parameters: fn.parameters } };
  });
}

function chatMessages(value: unknown): ContextMessage[] {
  if (!Array.isArray(value) || value.length > 1024) throw new ApiRequestError(400, "Provide a conversation of at most 1,024 messages.");
  for (const message of value) {
    if (!message || typeof message !== "object" || !["system", "developer", "user", "assistant", "tool"].includes(message.role) ||
      typeof message.content !== "string" || (message.thinking !== undefined && typeof message.thinking !== "string") ||
      (message.images !== undefined && (!Array.isArray(message.images) || message.images.some((image: unknown) => typeof image !== "string"))) ||
      (message.tool_name !== undefined && typeof message.tool_name !== "string") ||
      (message.tool_call_id !== undefined && typeof message.tool_call_id !== "string")) {
      throw new ApiRequestError(400, "Invalid chat message.");
    }
    if (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 8 ||
      message.tool_calls.some((call: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }) =>
        !call || typeof call.function?.name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(call.function.name) ||
        !call.function.arguments || typeof call.function.arguments !== "object" || Array.isArray(call.function.arguments) ||
        (call.id !== undefined && typeof call.id !== "string")))) {
      throw new ApiRequestError(400, "Invalid tool call history.");
    }
  }
  return value;
}

export async function POST(req: NextRequest) {
  let clearCookie = false;
  try {
    const optional = await loadOptionalAccount(req);
    clearCookie = optional.clearCookie;
    if (clearCookie) return reply(NextResponse.json({ error: "Sign in again to continue." }, { status: 401 }), true);
    const account = optional.account;
    const ip = clientKey(req);
    const overLimit = account
      ? !await takeRateLimit(`chat:${account.id}`, { limit: 30, windowMs: 60_000 })
      : !await takeRateLimit(`chat-anon:${ip}`, { limit: 5, windowMs: 60_000 }) ||
        !await takeRateLimit(`chat-anon-hour:${ip}`, { limit: 15, windowMs: 60 * 60 * 1000 });
    if (overLimit) {
      return reply(NextResponse.json({ error: "Too many requests." }, { status: 429 }), clearCookie);
    }

    const { messages: rawMessages, model, useReasoning, thinkingControl, tools, webSearch, harnessPhase, timeZone } = await readJsonBody(req, 48 * 1024 * 1024);
    const messages = chatMessages(rawMessages);
    if (useReasoning !== undefined && typeof useReasoning !== "boolean") {
      throw new ApiRequestError(400, "Thinking must be true or false.");
    }
    if (thinkingControl !== undefined && thinkingControl !== null && typeof thinkingControl !== "boolean" &&
      (typeof thinkingControl !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(thinkingControl))) {
      throw new ApiRequestError(400, "Invalid model thinking level.");
    }
    if (harnessPhase !== undefined && harnessPhase !== "plan" && harnessPhase !== "review" && harnessPhase !== "followups") {
      throw new ApiRequestError(400, "Invalid chat planning step.");
    }
    if (timeZone !== undefined && (typeof timeZone !== "string" || timeZone.length > 100)) {
      throw new ApiRequestError(400, "Invalid time zone.");
    }
    if (harnessPhase && req.headers.get("origin") !== req.nextUrl.origin) {
      throw new ApiRequestError(403, "Chat planning is available from this website.");
    }
    if (webSearch !== undefined && typeof webSearch !== "boolean") {
      throw new ApiRequestError(400, "Web search must be true or false.");
    }
    let validatedTools;
    if (tools !== undefined) {
      if (!account) throw new ApiRequestError(401, "Sign in to use MCP tools.");
      if (req.headers.get("origin") !== req.nextUrl.origin) {
        throw new ApiRequestError(403, "MCP chat requests must come from this website.");
      }
      validatedTools = chatTools(tools);
    }
    if (webSearch === true) {
      if (req.headers.get("origin") !== req.nextUrl.origin) {
        throw new ApiRequestError(403, "Web search chat requests must come from this website.");
      }
      validatedTools = chatTools([...(validatedTools ?? []), WEB_SEARCH_TOOL]);
    }
    const { base, apiKey } = inferenceKeyForAccount(account);
    const budget = harnessBudget(useReasoning === true);
    const format = harnessPhase === "followups" ? FOLLOW_UP_SCHEMA : harnessPhase ? (harnessPhase === "plan" ? PLAN_SCHEMA : REVIEW_SCHEMA) : undefined;
    const context = webSearch || harnessPhase || timeZone !== undefined ? [{ role: "system", content: [
      harnessClock(timeZone as string | undefined), ...(harnessPhase ? [harnessPhasePrompt(harnessPhase)] : []),
    ].join("\n\n") }, ...messages] : messages;
    const prepared = compactMessages(context, budget,
      estimateContextUnits(JSON.stringify(harnessPhase ? [] : validatedTools ?? [])) +
      estimateContextUnits(JSON.stringify(format ?? {})));
    const payload: Record<string, unknown> = {
      model: model || "qwen3.6:35b-a3b",
      messages: prepared.messages,
      stream: true,
      options: { num_predict: harnessPhase === "followups" ? 256 : harnessPhase ? budget.phaseTokens : budget.answerTokens,
        ...(harnessPhase ? { temperature: 0 } : {}) },
    };
    if (harnessPhase) {
      payload.format = format;
    } else if (validatedTools) payload.tools = validatedTools;
    payload.think = harnessPhase === "followups"
      ? selectThinkingControl(String(payload.model), undefined, false)
      : thinkingControl === undefined
      ? selectThinkingControl(String(payload.model), undefined, useReasoning === true)
      : thinkingControl;

    const response = await fetch(`${base}/olla/ollama/api/chat`, {
      method: "POST",
      headers: gatewayAuthHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(harnessPhase === "followups" ? 20000 : 180000)]),
    });

    if (!response.ok) {
      const upstream = await readUpstreamError(response, req.signal);
      const jsonHeaders = { "Content-Type": "application/json" };
      if ([530, 502, 401].includes(response.status)) {
        return reply(
          new Response(
            JSON.stringify({ error: "OFFLINE", message: "DGX Spark gateway is currently unavailable." }),
            { status: response.status, headers: jsonHeaders }
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
            { status: response.status, headers: jsonHeaders }
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
            { status: response.status, headers: jsonHeaders }
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
            { status: response.status, headers: jsonHeaders }
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
            { status: response.status, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      if (response.status === 400 && /does not support (tools|tool calling|function calling)/i.test(upstream)) {
        return reply(
          new Response(
            JSON.stringify({
              error: "MODEL_CAPABILITY",
              capability: "tools",
              message: "This model does not support automatic search or MCP tools. Choose a model with tool support.",
            }),
            { status: response.status, headers: jsonHeaders }
          ),
          clearCookie
        );
      }
      const cudaFailure = /\bCUDA (?:error|out of memory)\b/i.test(upstream);
      const runnerFailure = /\brunner (?:process |server )?(?:has )?(?:terminated|crashed|exited|failed|unexpectedly stopped)\b|\berror (?:was )?encountered while running the model\b/i.test(upstream);
      if (cudaFailure || runnerFailure) {
        console.error("Gateway error", { status: response.status, reason: cudaFailure ? "cuda_error" : "runner_error" });
        return reply(NextResponse.json({
          error: "MODEL_RUNTIME",
          message: "The AI inference runner failed. It may need to be restarted on the AI server.",
        }, { status: response.status }), clearCookie);
      }
      console.error("Gateway error", { status: response.status, reason: "upstream_error" });
      return reply(
        new Response(
          JSON.stringify({
            error: "UPSTREAM",
            message: "The model request failed. Try again or pick another model.",
          }),
          { status: response.status, headers: jsonHeaders }
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
    if (error instanceof ContextBudgetError) return reply(NextResponse.json({ error: error.message }, { status: 413 }), clearCookie);
    return reply(apiFailure(error, "Chat request failed:"), clearCookie);
  }
}
