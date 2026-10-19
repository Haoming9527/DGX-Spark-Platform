import { NextRequest, NextResponse } from "next/server";
import {
  APICallError, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateId, generateText,
  isStepCount, jsonSchema, Output, safeValidateUIMessages, streamText, toUIMessageStream, type ToolSet,
} from "ai";
import { createHmac } from "node:crypto";
import { loadOptionalAccount } from "../../../lib/auth/requireAccount";
import { clearSessionCookie, SESSION_COOKIE } from "../../../lib/auth/auth";
import { clientKey, takeRateLimit } from "../../../lib/security/rateLimit";
import { ApiRequestError, apiFailure, readJsonBody, requireSameOrigin } from "../../../lib/security/apiRequest";
import {
  acquireGuestStream, GUEST_BUSY, GUEST_DAILY_REQUESTS, GUEST_QUESTIONS_PER_HOUR, GUEST_QUESTIONS_PER_MINUTE,
  guestStreamRelease, releaseWhenDone, requireGuestDailyAllowance,
} from "../../../lib/security/guestLimits";
import {
  BUDGET_EXHAUSTED, clipHarnessText, harnessBudget, harnessClock, harnessPhasePrompt, PLAN_SCHEMA, searchEvidenceInstruction,
  TOOL_POLICY, type SearchPlan,
} from "../../../lib/chat/chatHarness";
import { ContextBudgetError, estimateContextUnits } from "../../../lib/chat/harnessContext";
import { trimConversation } from "../../../lib/chat/context";
import { mcpTools, runSearch, searchTool, toolsExhausted, type ToolUsage } from "../../../lib/chat/chatTools";
import { chatModel, reasoningOptions } from "../../../lib/inference/chatModel";
import { selectThinkingControl, type ThinkingControl } from "../../../lib/models/modelThinking";
import type { ChatUIMessage, SearchToolOutput } from "../../types/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = /^image\/(?:png|jpeg|webp|gif)$/;

function reply(res: Response, clearCookie: boolean) {
  const out = new NextResponse(res.body, { status: res.status, headers: res.headers });
  if (clearCookie) clearSessionCookie(out);
  return out;
}

function readOptions(body: Record<string, unknown>) {
  const { model, useReasoning, thinkingControl, webSearch, tools, connectionIds, timeZone } = body;
  if (typeof model !== "string" || !model.trim() || model.length > 256) throw new ApiRequestError(400, "Choose a model.");
  if (useReasoning !== undefined && typeof useReasoning !== "boolean") throw new ApiRequestError(400, "Thinking must be true or false.");
  if (thinkingControl !== undefined && thinkingControl !== null && typeof thinkingControl !== "boolean" &&
    (typeof thinkingControl !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(thinkingControl))) {
    throw new ApiRequestError(400, "Invalid model thinking level.");
  }
  if (webSearch !== undefined && typeof webSearch !== "boolean") throw new ApiRequestError(400, "Web search must be true or false.");
  if (tools !== undefined && typeof tools !== "boolean") throw new ApiRequestError(400, "Tool support must be true or false.");
  if (connectionIds !== undefined && (!Array.isArray(connectionIds) || connectionIds.length > 8 ||
    connectionIds.some(id => typeof id !== "string" || !UUID.test(id)))) {
    throw new ApiRequestError(400, "Invalid MCP selection.");
  }
  if (timeZone !== undefined && (typeof timeZone !== "string" || timeZone.length > 100)) throw new ApiRequestError(400, "Invalid time zone.");
  return {
    model: model.trim(), deep: useReasoning === true,
    thinking: (thinkingControl === undefined
      ? selectThinkingControl(model, undefined, useReasoning === true, tools === true) : thinkingControl) as ThinkingControl,
    webSearch: webSearch === true, tools: tools === true,
    connectionIds: [...new Set((connectionIds ?? []) as string[])],
    timeZone: timeZone as string | undefined,
  };
}

async function readMessages(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 1024) {
    throw new ApiRequestError(400, "Provide a conversation of at most 1,024 messages.");
  }
  const result = await safeValidateUIMessages<ChatUIMessage>({ messages: value });
  if (!result.success) throw new ApiRequestError(400, "Invalid chat message.");
  for (const message of result.data) {
    for (const part of message.parts) {
      // Only inline images: URLs would make the server fetch arbitrary addresses on the client's behalf.
      if (part.type === "file" && (message.role !== "user" || !IMAGE_TYPES.test(part.mediaType) || !part.url.startsWith("data:"))) {
        throw new ApiRequestError(400, "Attach images as PNG, JPEG, WebP or GIF files.");
      }
    }
  }
  return result.data;
}

function messageText(message: ChatUIMessage) {
  return message.parts.flatMap(part => part.type === "text" ? [part.text] : []).join("\n");
}

// Error text shown in the chat. A leading [CODE] or [CODE:capability] lets the client react (refresh models,
// turn off thinking, mark the server as sleeping) the same way it did for the previous JSON errors.
function chatErrorMessage(error: unknown): string {
  if (typeof error === "string") return error; // Already mapped by the inner stream.
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof ContextBudgetError) return error.message;
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  const text = APICallError.isInstance(error) ? `${error.message} ${error.responseBody ?? ""}` : error instanceof Error ? error.message : "";
  if (/model_endpoint_mismatch/.test(text)) {
    return "[MODEL_CAPABILITY:chat] This model supports System One decisions. Use POST /v1/systemone, or choose a chat model.";
  }
  if (status === undefined && /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket/i.test(text)) {
    return "[OFFLINE] The AI gateway is currently unavailable.";
  }
  if (status !== undefined && [530, 502, 401].includes(status)) return "[OFFLINE] The AI gateway is currently unavailable.";
  if (status === 503 || /NO_ENDPOINTS|no healthy endpoints|service_unavailable/i.test(text)) return "[SLEEPING] No AI servers are online.";
  if (status === 404 || /model ['"][^'"]+['"] not found|model not found/i.test(text)) {
    return "[MODEL_UNAVAILABLE] That model is not available. Choose another model.";
  }
  if (/does not support thinking/i.test(text)) return "[MODEL_CAPABILITY:thinking] This model does not support thinking. Turn it off or pick another model.";
  if (/does not support (images|vision)/i.test(text)) return "[MODEL_CAPABILITY:vision] This model does not accept images. Remove attachments or pick a vision model.";
  if (/does not support (tools|tool calling|function calling)/i.test(text)) {
    return "[MODEL_CAPABILITY:tools] This model does not support automatic search or MCP tools. Choose a model with tool support.";
  }
  if (/\bCUDA (?:error|out of memory)\b|\brunner (?:process |server )?(?:has )?(?:terminated|crashed|exited|failed|unexpectedly stopped)\b/i.test(text)) {
    return "[MODEL_RUNTIME] The AI inference runner failed. It may need to be restarted on the AI server.";
  }
  console.error(`Chat stream failed: ${JSON.stringify({
    status, name: error instanceof Error ? error.name : typeof error, message: text.slice(0, 300),
  })}`);
  return "The model request failed. Try again or pick another model.";
}

async function planSearchQuery(model: ReturnType<typeof chatModel>, messages: ChatUIMessage[], deep: boolean, timeZone: string | undefined, signal: AbortSignal) {
  const question = messageText(messages.findLast(message => message.role === "user")!).slice(0, 1000);
  // A short first message is already a standalone query; planning only helps resolve follow-ups from context.
  if (messages.filter(message => message.role === "user").length === 1 && question.length <= 200) return question;
  const conversation = messages.filter(message => message.role !== "system").slice(-4)
    .map(message => ({ role: message.role, content: clipHarnessText(messageText(message), deep ? 700 : 400) }));
  try {
    const { output } = await generateText({
      model,
      instructions: `${harnessClock(timeZone)}\n\n${harnessPhasePrompt("plan")}`,
      prompt: JSON.stringify({ conversation, forceSearch: true, webSearchAvailable: true, connectedTools: [] }),
      output: Output.object({ schema: jsonSchema<SearchPlan>(PLAN_SCHEMA as never) }),
      maxOutputTokens: harnessBudget(deep).phaseTokens,
      temperature: 0,
      providerOptions: reasoningOptions(false),
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    const query = output?.arguments?.query;
    if (typeof query === "string" && query.trim() && query.length <= 1000) return query;
  } catch {
    signal.throwIfAborted();
  }
  return question;
}

export async function POST(req: NextRequest) {
  let clearCookie = false;
  let releaseLease: (() => void) | undefined;
  let streaming = false;
  try {
    requireSameOrigin(req);
    const optional = await loadOptionalAccount(req);
    clearCookie = optional.clearCookie;
    if (clearCookie) return reply(NextResponse.json({ error: "Sign in again to continue." }, { status: 401 }), true);
    const account = optional.account;
    const ip = clientKey(req);
    // One request covers a whole question (all of its steps, searches and tool calls).
    const overLimit = account
      ? !await takeRateLimit(`chat:${account.id}`, { limit: 30, windowMs: 60_000 })
      : !await takeRateLimit(`chat-anon:${ip}`, { limit: GUEST_QUESTIONS_PER_MINUTE, windowMs: 60_000 }) ||
        !await takeRateLimit(`chat-anon-hour:${ip}`, { limit: GUEST_QUESTIONS_PER_HOUR, windowMs: 60 * 60 * 1000 });
    if (overLimit) return reply(NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 }), clearCookie);
    if (!account) await requireGuestDailyAllowance("chat-anon-day", ip, GUEST_DAILY_REQUESTS);

    const body = await readJsonBody(req, 48 * 1024 * 1024);
    const options = readOptions(body);
    const messages = await readMessages(body.messages);
    const continuing = messages.at(-1)?.role === "assistant";
    const preSearch = !continuing && options.webSearch;
    if (options.connectionIds.length && !options.tools) throw new ApiRequestError(400, "Choose a model that supports tools, or deselect your MCP servers.");
    const cookie = req.cookies.get(SESSION_COOKIE)?.value;
    if (options.connectionIds.length && (!account || !cookie)) throw new ApiRequestError(401, "Sign in to use MCP tools.");

    const budget = harnessBudget(options.deep);
    const usage: ToolUsage = { searches: 0, toolCalls: 0 };
    const model = chatModel(account, options.model);
    const searchOptions = { account, ip, usage, budget, signal: req.signal, cache: new Map<string, SearchToolOutput>() };
    const tools: ToolSet = options.tools ? {
      search_web: searchTool({ ...searchOptions, deep: options.deep }),
      ...(account && cookie ? await mcpTools({
        account, cookie, connectionIds: options.connectionIds, origin: req.nextUrl.origin, signal: req.signal, usage, budget,
      }) : {}),
    } : {};
    const mcpNames = Object.keys(tools).filter(name => name.startsWith("mcp_"));
    const instructions = [harnessClock(options.timeZone), options.tools ? TOOL_POLICY : ""].filter(Boolean);
    const modelMessages = await convertToModelMessages(
      trimConversation(messages, budget, estimateContextUnits(JSON.stringify(instructions)) + 1024 +
        Object.keys(tools).length * 512),
      { tools, ignoreIncompleteToolCalls: true, convertDataPart: () => undefined },
    );

    if (!account) {
      const lease = await acquireGuestStream(ip);
      if (!lease) throw new ApiRequestError(429, "Guest capacity is full right now. Sign in or try again in a moment.", GUEST_BUSY);
      releaseLease = guestStreamRelease(lease);
    }

    const secret = process.env.JWT_SECRET!;
    const startedAt = Date.now();
    const stream = createUIMessageStream<ChatUIMessage>({
      originalMessages: messages,
      generateId,
      onError: chatErrorMessage,
      execute: async ({ writer }) => {
        let started = false;
        if (preSearch) {
          writer.write({ type: "start" });
          started = true;
          writer.write({ type: "data-search", id: "search", data: { status: "searching" } });
          const query = await planSearchQuery(model, messages, options.deep, options.timeZone, req.signal);
          const result = await runSearch(query, searchOptions);
          writer.write({
            type: "data-search", id: "search",
            data: { status: result.sources.length ? "done" : "failed", query: result.query, sources: result.sources, message: result.message },
          });
          if (result.sources.length) instructions.push(searchEvidenceInstruction(result.sources, options.deep));
          else if (result.message) instructions.push(`Web search for this request returned no evidence: ${result.message}`);
        }
        const base = instructions.join("\n\n");
        const preSearchUrls = new Set([...searchOptions.cache.values()].flatMap(output => output.sources.map(source => source.url)));
        const result = streamText({
          model,
          instructions: base,
          messages: modelMessages,
          tools,
          toolApproval: Object.fromEntries(mcpNames.map(name => [name, "user-approval" as const])),
          experimental_toolApprovalSecret: createHmac("sha256", secret).update("tool-approval").digest(),
          stopWhen: isStepCount(budget.maxModelCalls),
          prepareStep: ({ stepNumber }) => Object.keys(tools).length && (stepNumber >= budget.maxModelCalls - 1 || toolsExhausted(usage, budget))
            ? { instructions: `${base}\n\n${BUDGET_EXHAUSTED}` } : undefined,
          maxOutputTokens: budget.answerTokens,
          providerOptions: reasoningOptions(options.thinking),
          abortSignal: req.signal,
          timeout: { totalMs: 290_000 },
        });
        writer.merge(toUIMessageStream<ToolSet, ChatUIMessage>({ stream: result.stream, sendStart: !started, sendFinish: false, onError: chatErrorMessage }));
        let steps;
        try {
          steps = await result.steps;
        } catch {
          return; // The error was already sent to the client by the stream above.
        }
        let tokens = steps.reduce((sum, step) => sum + (step.usage.outputTokens ?? 0), 0);
        const last = steps.at(-1);
        const awaitingApproval = last?.content.some(part => part.type === "tool-approval-request");
        if (last && !last.text.trim() && last.finishReason === "tool-calls" && !awaitingApproval) {
          // The step limit ended the loop on another tool call: answer from the evidence gathered so far.
          const sources = [...new Map([...searchOptions.cache.values()].flatMap(output => output.sources)
            .filter(source => !preSearchUrls.has(source.url)).map(source => [source.url, source])).values()];
          const final = streamText({
            model,
            instructions: [base, sources.length ? searchEvidenceInstruction(sources, options.deep) : "", BUDGET_EXHAUSTED].filter(Boolean).join("\n\n"),
            messages: modelMessages,
            maxOutputTokens: budget.answerTokens,
            providerOptions: reasoningOptions(options.thinking),
            abortSignal: req.signal,
            timeout: { totalMs: 120_000 },
          });
          writer.merge(toUIMessageStream<ToolSet, ChatUIMessage>({ stream: final.stream, sendStart: false, sendFinish: false, onError: chatErrorMessage }));
          try {
            tokens += (await final.totalUsage).outputTokens ?? 0;
          } catch {
            return;
          }
        }
        writer.write({ type: "finish", messageMetadata: { tokens, durationMs: Date.now() - startedAt } });
      },
    });

    const response = createUIMessageStreamResponse({ stream });
    const output = releaseLease && response.body ? releaseWhenDone(response.body, releaseLease, req.signal) : response.body;
    streaming = output !== null;
    return reply(new Response(output, { status: response.status, headers: response.headers }), clearCookie);
  } catch (error: unknown) {
    if (error instanceof ContextBudgetError) return reply(NextResponse.json({ error: error.message, code: error.code }, { status: 413 }), clearCookie);
    return reply(apiFailure(error, "Chat request failed:"), clearCookie);
  } finally {
    if (!streaming) releaseLease?.();
  }
}
