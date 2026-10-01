import "server-only";
import { ApiRequestError } from "./apiRequest";
import { normalizeSourceUrl, sourceId, type SearchSource } from "./searchEvidence";

function searchFailure(reason: string, status?: number): never {
  console.error("LangSearch failed:", { reason, status });
  throw new ApiRequestError(status === 504 ? 504 : 503, status === 429
    ? "Web search has reached its service limit. Try again later."
    : status === 504 ? "Web search timed out. Try again."
    : "Web search is temporarily unavailable. Try again later.");
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body || !response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel();
    return searchFailure("invalid_response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 524288) return searchFailure("response_too_large");
      chunks.push(value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function searchWeb(query: string, requestSignal: AbortSignal): Promise<SearchSource[]> {
  requestSignal.throwIfAborted();
  const key = process.env.LANGSEARCH_KEY?.trim();
  if (!key) {
    console.error("LangSearch failed:", { reason: "missing_key" });
    throw new ApiRequestError(503, "Web search is not configured.");
  }
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(20000)]);
  try {
    const response = await fetch("https://api.langsearch.com/v1/web-search", {
      method: "POST", signal, redirect: "error", credentials: "omit", cache: "no-store",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, count: 8, contents: { text: { maxCharacters: 3000 } }, freshness: "noLimit" }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return searchFailure("http_error", response.status);
    }
    const body = await readResponse(response, signal);
    if (!body || typeof body !== "object") return searchFailure("invalid_response");
    const { code, data } = body as { code?: unknown; data?: { webPages?: { value?: unknown } } };
    if (code !== undefined && code !== 200) return searchFailure("service_error", typeof code === "number" ? code : undefined);
    const results = data?.webPages?.value;
    if (!Array.isArray(results)) return searchFailure("invalid_results");
    const sources = new Map<string, SearchSource>();
    const retrievedAt = new Date().toISOString();
    for (const item of results) {
      if (!item || typeof item !== "object" || typeof item.url !== "string") continue;
      const url = normalizeSourceUrl(item.url);
      if (!url || sources.has(url)) continue;
      const content = typeof item.text === "string" ? item.text.slice(0, 3000).trim() : "";
      const publishedAt = typeof item.datePublished === "string" && /^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/.test(item.datePublished)
        && Number.isFinite(Date.parse(item.datePublished)) ? new Date(item.datePublished).toISOString() : undefined;
      sources.set(url, {
        id: sourceId(url), url,
        title: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 300) : new URL(url).hostname,
        snippet: typeof item.snippet === "string" ? item.snippet.trim().slice(0, 1200) : "",
        ...(content ? { content, pageUrl: url } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        retrievedAt, readStatus: content ? "read" : "not_read",
      });
      if (sources.size === 8) break;
    }
    return [...sources.values()];
  } catch (error) {
    requestSignal.throwIfAborted();
    if (error instanceof ApiRequestError) throw error;
    return searchFailure(signal.aborted ? "timeout" : "request_failed", signal.aborted ? 504 : undefined);
  }
}
