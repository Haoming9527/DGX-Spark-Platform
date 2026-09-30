import { NextRequest, NextResponse } from "next/server";
import { search } from "duck-duck-scrape";
import { loadOptionalAccount } from "../../../lib/requireAccount";
import { clientKey, takeRateLimit } from "../../../lib/rateLimit";
import { ApiRequestError, apiFailure, readJsonBody } from "../../../lib/apiRequest";
import { unauthorizedResponse } from "../../../lib/auth";
import { enrichSearchSources } from "../../../lib/webSearch";
import { normalizeSourceUrl, sourceId, type SearchSource } from "../../../lib/searchEvidence";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin) {
      throw new ApiRequestError(403, "Web search is available from this website.");
    }
    const { account, clearCookie } = await loadOptionalAccount(req);
    if (clearCookie) return unauthorizedResponse(true);
    const bucket = account ? `web-search:${account.id}` : `web-search-anon:${clientKey(req)}`;
    if (!await takeRateLimit(bucket, { limit: account ? 15 : 5, windowMs: 60_000 })) {
      throw new ApiRequestError(429, "Too many searches. Please wait a moment.");
    }
    if (!account && !await takeRateLimit(`${bucket}:hour`, { limit: 15, windowMs: 3_600_000 })) {
      throw new ApiRequestError(429, "Search limit reached. Please try again later.");
    }
    const { query } = await readJsonBody(req, 8192);
    if (typeof query !== "string" || !query.trim() || query.length > 1000) {
      throw new ApiRequestError(400, "Enter a search question of up to 1,000 characters.");
    }
    if ((search as typeof search & { htmlBackendVersion?: number }).htmlBackendVersion !== 1) {
      console.error("DuckDuckGo patch missing. Run npm install.");
      throw new ApiRequestError(503, "Web search is not configured.");
    }
    let result: Awaited<ReturnType<typeof search>>;
    try {
      const options: NonNullable<Parameters<typeof search>[2]> & { signal: AbortSignal } = { signal: req.signal };
      result = await search(query.trim(), { backend: "html" }, options);
    } catch {
      throw new ApiRequestError(503, "DuckDuckGo could not be reached or blocked the search. This is a search service failure, not evidence that no results exist.");
    }
    const sources = new Map<string, SearchSource>();
    for (const item of result.results.slice(0, 8)) {
      const url = normalizeSourceUrl(item.url);
      if (url && !sources.has(url)) sources.set(url, { id: sourceId(url), title: item.title, url, snippet: item.description, readStatus: "not_read" });
    }
    const evidence = await enrichSearchSources([...sources.values()], req.signal, query.trim());
    return NextResponse.json({
      query: query.trim(), sources: evidence, serverTime: new Date().toISOString(),
      ...(!evidence.length ? { message: "No results matched this query. Try a different query or source." } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, "Web search failed:");
  }
}
