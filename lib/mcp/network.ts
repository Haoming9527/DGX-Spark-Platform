import "server-only";
import { Agent } from "undici";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ApiRequestError } from "../apiRequest";
import { resolvePublic } from "../publicNetwork";
export { resolvePublic } from "../publicNetwork";

export function publicUrl(value: string | URL): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiRequestError(400, "Enter a valid public HTTPS server URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.href.length > 2048) {
    throw new ApiRequestError(400, "MCP servers must use public HTTPS URLs without embedded credentials or fragments.");
  }
  return url;
}

export function mcpNetwork(requestSignal: AbortSignal, timeoutMs = 45000) {
  const controller = new AbortController();
  const signal = AbortSignal.any([requestSignal, controller.signal, AbortSignal.timeout(timeoutMs)]);
  const agents = new Set<Agent>();
  let requests = 0;
  let bytes = 0;
  let toolCalls = 0;
  const fetchSafe: FetchLike = async (input, init = {}) => {
    signal.throwIfAborted();
    if (++requests > 24) throw new ApiRequestError(502, "MCP server exceeded the request limit.");
    const url = publicUrl(input);
    const addresses = await resolvePublic(url, signal);
    if (typeof init.body === "string" && init.headers) {
      const headers = new Headers(init.headers);
      if (headers.get("content-type")?.includes("application/json")) {
        try {
          const message = JSON.parse(init.body);
          const calls = (Array.isArray(message) ? message : [message]).filter(item => item?.method === "tools/call");
          toolCalls += calls.length;
          if (toolCalls > 1) throw new ApiRequestError(409, "Tool calls are never retried automatically.");
        } catch (error) { if (error instanceof ApiRequestError) throw error; }
      }
    }
    const agent = new Agent({
      connect: {
        timeout: 8000,
        lookup: (hostname, options, callback) => {
          if (hostname.replace(/^\[|\]$/g, "") !== url.hostname.replace(/^\[|\]$/g, "")) {
            callback(new Error("Host changed during connection"), "", 4);
          } else if (options.all) {
            callback(null, addresses);
          } else {
            const address = addresses.find(item => !options.family || item.family === options.family) ?? addresses[0];
            callback(null, address.address, address.family);
          }
        },
      },
    });
    agents.add(agent);
    const headers = new Headers(init.headers);
    headers.delete("cookie");
    const response = await fetch(url, {
      ...init, headers, redirect: "error", credentials: "omit",
      signal: AbortSignal.any([signal, ...(init.signal ? [init.signal] : [])]),
      dispatcher: agent,
    } as RequestInit & { dispatcher: Agent });
    if (Number(response.headers.get("content-length")) > 262144) {
      await response.body?.cancel();
      throw new ApiRequestError(502, "MCP response is too large.");
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    let responseBytes = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) { stream.close(); return; }
          bytes += value.byteLength;
          responseBytes += value.byteLength;
          if (bytes > 1048576 || responseBytes > 262144) {
            await reader.cancel();
            throw new ApiRequestError(502, "MCP response is too large.");
          }
          stream.enqueue(value);
        } catch (error) { stream.error(error); }
      },
      cancel: reason => reader.cancel(reason),
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  return {
    fetch: fetchSafe, signal,
    async close() {
      controller.abort();
      await Promise.allSettled([...agents].map(agent => agent.destroy()));
    },
  };
}
