import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { dynamicTool, jsonSchema, tool, wrapLanguageModel, type LanguageModel, type ToolSet } from "ai";
import type { Account } from "../auth/account";
import { callMcp, connectMcp } from "../mcp/client";
import { digest } from "../mcp/crypto";
import { cleanExpiredStates, connectionFor } from "../mcp/storage";
import { searchWeb } from "../search/webSearchProvider";
import { WEB_SEARCH_TOOL } from "../search/webSearchTool";
import { ApiRequestError } from "../security/apiRequest";
import { GUEST_DAILY_SEARCHES, requireGuestDailyAllowance } from "../security/guestLimits";
import { takeRateLimit } from "../security/rateLimit";
import type { McpToolMetadata, McpToolOutput, SearchToolOutput } from "../../app/types/chat";
import { evidenceForModel, harnessBudget } from "./chatHarness";
import { compactToolContent } from "./harnessContext";

type Budget = ReturnType<typeof harnessBudget>;

export type ToolUsage = { searches: number; toolCalls: number };

export function toolsExhausted(usage: ToolUsage, budget: Budget) {
  return usage.toolCalls >= budget.maxToolCalls;
}

async function searchAllowed(account: Account | null, ip: string): Promise<string | null> {
  const bucket = account ? `web-search:${account.id}` : `web-search-anon:${ip}`;
  if (!await takeRateLimit(bucket, { limit: account ? 15 : 5, windowMs: 60_000 })) return "Too many searches. Please wait a moment.";
  if (!account && !await takeRateLimit(`${bucket}:hour`, { limit: 15, windowMs: 3_600_000 })) return "Search limit reached. Please try again later.";
  if (!account) {
    try {
      await requireGuestDailyAllowance("web-search-anon-day", ip, GUEST_DAILY_SEARCHES);
    } catch (error) {
      if (error instanceof ApiRequestError) return error.message;
      throw error;
    }
  }
  return null;
}

export async function runSearch(query: string, options: {
  account: Account | null; ip: string; usage: ToolUsage; budget: Budget; signal: AbortSignal; cache: Map<string, SearchToolOutput>;
}): Promise<SearchToolOutput> {
  const clean = query.trim().replace(/\s+/g, " ");
  const key = clean.toLocaleLowerCase();
  const cached = options.cache.get(key);
  if (cached) return cached;
  if (!clean || clean.length > 1000) return { query: clean, message: "Use a focused query of at most 1,000 characters.", sources: [] };
  if (options.usage.searches >= options.budget.maxSearches) {
    return { query: clean, message: "Search budget exhausted. Use the available evidence and state its limits.", sources: [] };
  }
  if (toolsExhausted(options.usage, options.budget)) {
    return { query: clean, message: "Tool budget exhausted. Answer from the available results.", sources: [] };
  }
  const limited = await searchAllowed(options.account, options.ip);
  if (limited) return { query: clean, message: limited, sources: [] };
  options.usage.searches++;
  options.usage.toolCalls++;
  try {
    const sources = await searchWeb(clean, options.signal);
    const result: SearchToolOutput = {
      query: clean, serverTime: new Date().toISOString(), sources,
      ...(!sources.length ? { message: "No results matched this query. Try a different query or source." } : {}),
    };
    options.cache.set(key, result);
    return result;
  } catch (error) {
    options.signal.throwIfAborted();
    return {
      query: clean, sources: [],
      message: (error instanceof ApiRequestError ? error.message : "Web retrieval failed.") +
        " No evidence was obtained by this attempt. Try a different query or source if useful. Never invent missing facts.",
    };
  }
}

export function searchTool(options: Parameters<typeof runSearch>[1] & { deep: boolean }) {
  return tool({
    description: WEB_SEARCH_TOOL.function.description,
    inputSchema: jsonSchema<{ query: string }>(WEB_SEARCH_TOOL.function.parameters as never),
    execute: ({ query }, { abortSignal }) => runSearch(query, { ...options, signal: abortSignal ?? options.signal }),
    toModelOutput: ({ output }) => ({
      type: "json",
      value: { query: output.query, serverTime: output.serverTime ?? null, message: output.message ?? null,
        sources: evidenceForModel(output.sources, options.deep) },
    }),
  });
}

function requestIdFor(userId: string, toolCallId: string) {
  const hex = createHash("sha256").update(`${userId}:${toolCallId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Wraps the user's selected MCP servers as tools. Each call still goes through callMcp, which enforces the
// connection revision, credential redaction, network guards and one execution per approved request.
export async function mcpTools(options: {
  account: Account; cookie: string; connectionIds: string[]; origin: string; signal: AbortSignal;
  usage: ToolUsage; budget: Budget;
}): Promise<{ tools: ToolSet; catalog: McpToolCatalogEntry[] }> {
  const tools: ToolSet = {};
  const catalog: McpToolCatalogEntry[] = [];
  if (!options.connectionIds.length) return { tools, catalog };
  await cleanExpiredStates();
  const sessionHash = digest(options.cookie);
  for (const id of options.connectionIds) {
    const record = await connectionFor(options.account.id, id);
    const result = await connectMcp(record, { origin: options.origin, sessionHash, signal: options.signal });
    if ("authorizationUrl" in result) throw new ApiRequestError(409, `Reconnect ${record.name} in MCP to sign in.`);
    for (const remote of result.tools) {
      if (Object.keys(tools).length >= 47) throw new ApiRequestError(400, "Too many tools. Select fewer MCP servers.");
      const suffix = createHash("sha256").update(`${id}:${remote.name}`).digest("hex").slice(0, 24);
      const name = `mcp_${remote.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30)}_${suffix}`;
      const metadata: McpToolMetadata = { server: record.name, name: remote.name, url: record.url };
      const description = `${record.name}: ${remote.name}. ${remote.description ?? ""}`.slice(0, 2048);
      catalog.push({ name, description, parameters: remote.inputSchema });
      tools[name] = dynamicTool({
        title: `${record.name} · ${remote.name}`,
        metadata,
        description,
        inputSchema: jsonSchema(remote.inputSchema as never),
        execute: async (input, { toolCallId, abortSignal }): Promise<McpToolOutput> => {
          if (toolsExhausted(options.usage, options.budget)) {
            return { content: "Tool budget exhausted. This call was not executed. Answer from the available results.", isError: true };
          }
          if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 16384) {
            return { content: "Tool arguments must be a JSON object smaller than 16 KB.", isError: true };
          }
          options.usage.toolCalls++;
          const output = await callMcp(record, {
            name: remote.name, arguments: input as Record<string, unknown>,
            requestId: requestIdFor(options.account.id, toolCallId),
            origin: options.origin, sessionHash, signal: abortSignal ?? options.signal,
          });
          if ("authorizationUrl" in output) throw new ApiRequestError(409, `Reconnect ${record.name} in MCP to sign in.`);
          return { content: compactToolContent(output.content, options.budget.maxToolResultUnits), isError: output.isError };
        },
      });
    }
  }
  return { tools, catalog };
}

export type McpToolCatalogEntry = { name: string; description: string; parameters: Record<string, unknown> };

export function scriptedToolCall(model: LanguageModel, call: { toolName: string; input: Record<string, unknown> }) {
  if (typeof model === "string") throw new Error("A model instance is required.");
  const toolCallId = `call_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
  const finishReason = { unified: "tool-calls" as const, raw: "tool_calls" };
  const toolCall = { type: "tool-call" as const, toolCallId, toolName: call.toolName, input: JSON.stringify(call.input) };
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async () => ({ content: [toolCall], finishReason, usage, warnings: [] }),
      wrapStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue(toolCall);
            controller.enqueue({ type: "finish", usage, finishReason });
            controller.close();
          },
        }),
      }),
    },
  });
}
