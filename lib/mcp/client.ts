import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { ApiRequestError } from "../apiRequest";
import { loadAccount } from "../account";
import { prisma } from "../prisma";
import { mcpNetwork } from "./network";
import { McpOAuthProvider, saveAuthorization } from "./oauth";
import { connectionFor, readCredentials, saveCredentials, type McpCredentials, type McpRecord } from "./storage";
import type { McpTool } from "./types";

function redact(value: string, credentials: McpCredentials) {
  for (const secret of [credentials.token, credentials.tokens?.access_token, credentials.tokens?.refresh_token, credentials.client?.client_secret]) {
    if (secret) value = value.replaceAll(secret, "[redacted]");
  }
  return value;
}

async function toolsFor(client: Client, signal: AbortSignal): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await client.request({ method: "tools/list", params: cursor ? { cursor } : {} }, ListToolsResultSchema,
      { signal, timeout: 15000 });
    for (const tool of result.tools) {
      if (tools.length >= 40 || tool.name.length > 128 || JSON.stringify(tool.inputSchema).length > 16384) {
        throw new ApiRequestError(502, "The MCP server exposes too many or oversized tools (maximum 40).");
      }
      if (tools.some(item => item.name === tool.name)) throw new ApiRequestError(502, "MCP tool names must be unique.");
      tools.push({ name: tool.name, description: tool.description?.slice(0, 2000), inputSchema: tool.inputSchema });
    }
    cursor = result.nextCursor;
    if (cursor) {
      if (cursors.has(cursor) || cursors.size >= 5) throw new ApiRequestError(502, "The MCP tool list could not be completed.");
      cursors.add(cursor);
    }
  } while (cursor);
  if (JSON.stringify(tools).length > 65536) throw new ApiRequestError(502, "The MCP tool descriptions are too large.");
  return tools;
}

async function withClient<T>(record: McpRecord, input: {
  origin: string; sessionHash: string; signal: AbortSignal; authorize: boolean;
}, run: (client: Client, credentials: McpCredentials, signal: AbortSignal) => Promise<T>) {
  const credentials = readCredentials(record);
  const network = mcpNetwork(input.signal);
  const provider = record.auth === "oauth" || record.auth === "auto"
    ? new McpOAuthProvider(credentials, `${input.origin}/api/mcp/oauth/callback`, network.signal) : undefined;
  const authorization = record.auth === "token" ? credentials.token : credentials.tokens?.access_token;
  const client = new Client({ name: "dgx-spark-web-chat", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(record.url), {
    fetch: network.fetch,
    authProvider: input.authorize ? provider : undefined,
    requestInit: authorization && (!provider || !input.authorize) ? { headers: { Authorization: `Bearer ${authorization}` } } : undefined,
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
  });
  try {
    if (input.authorize && provider && ((record.auth === "oauth" && !credentials.tokens) ||
        (credentials.tokens && credentials.expiresAt && credentials.expiresAt <= Date.now() + 30000))) {
      const result = await auth(provider!, { serverUrl: record.url, fetchFn: network.fetch });
      if (result === "REDIRECT") {
        await saveAuthorization(record, provider!, input.sessionHash);
        return { authorizationUrl: provider!.authorizationUrl };
      }
    }
    if (!input.authorize && record.auth === "oauth" && !credentials.tokens) {
      throw new ApiRequestError(409, "Reconnect and authorize this MCP server before using its tools.");
    }
    await client.connect(transport, { signal: network.signal, timeout: 15000 });
    const result = await run(client, credentials, network.signal);
    if (input.authorize) await saveCredentials(record, credentials, true);
    return result;
  } catch (error) {
    if (input.authorize && provider?.authorizationUrl) {
      await saveAuthorization(record, provider, input.sessionHash);
      return { authorizationUrl: provider.authorizationUrl };
    }
    throw error;
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
    await network.close();
  }
}

export function connectMcp(record: McpRecord, input: { origin: string; sessionHash: string; signal: AbortSignal }) {
  return withClient(record, { ...input, authorize: true }, async (client, credentials, signal) => {
    const tools = await toolsFor(client, signal);
    return { tools: JSON.parse(JSON.stringify(tools, (_key, value: unknown) =>
      typeof value === "string" ? redact(value, credentials) : value)) as McpTool[] };
  });
}

export async function callMcp(record: McpRecord, input: {
  name: string; arguments: Record<string, unknown>; requestId: string; origin: string; sessionHash: string; signal: AbortSignal;
}) {
  if (!record.connected_at) throw new ApiRequestError(409, "Connect this MCP server before calling its tools.");
  const claimed = await prisma.$executeRaw`
    INSERT INTO mcp_calls (user_id, request_id, connection_id, expires_at)
    VALUES (${record.user_id}::uuid, ${input.requestId}::uuid, ${record.id}::uuid, statement_timestamp() + INTERVAL '24 hours')
    ON CONFLICT (user_id, request_id) DO NOTHING
  `;
  if (!claimed) throw new ApiRequestError(409, "This tool request was already submitted. It will not be run again.");
  return withClient(record, { ...input, authorize: false }, async (client, credentials, signal) => {
    const tools = await toolsFor(client, signal);
    if (!tools.some(tool => tool.name === input.name)) throw new ApiRequestError(400, "This tool is no longer available on the selected server.");
    const account = await loadAccount(record.user_id);
    if (!account || account.disabled) throw new ApiRequestError(403, "Your account cannot use MCP tools.");
    const current = await connectionFor(record.user_id, record.id);
    if (current.revision !== record.revision) throw new ApiRequestError(409, "MCP authentication changed. Reconnect before running the tool.");
    const result = await client.request({ method: "tools/call", params: { name: input.name, arguments: input.arguments } },
      CallToolResultSchema, { signal, timeout: 30000 });
    const parts = result.content.filter(item => item.type === "text").map(item => item.text);
    if (result.structuredContent) parts.push(JSON.stringify(result.structuredContent));
    const text = redact(parts.join("\n\n"), credentials);
    const buffer = Buffer.from(text || "The tool returned no text. Images, files, and embedded resources are not loaded.");
    return {
      content: buffer.subarray(0, 32768).toString("utf8") + (buffer.length > 32768 ? "\n[Result truncated]" : ""),
      isError: result.isError === true,
    };
  });
}
