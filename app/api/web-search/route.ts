import { NextRequest, NextResponse } from "next/server";
import { loadOptionalAccount } from "../../../lib/requireAccount";
import { clientKey, takeRateLimit } from "../../../lib/rateLimit";
import { ApiRequestError, apiFailure, readJsonBody } from "../../../lib/apiRequest";
import { unauthorizedResponse } from "../../../lib/auth";
import { searchWeb } from "../../../lib/webSearchProvider";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    const evidence = await searchWeb(query.trim(), req.signal);
    return NextResponse.json({
      query: query.trim(), sources: evidence, serverTime: new Date().toISOString(),
      ...(!evidence.length ? { message: "No results matched this query. Try a different query or source." } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, "Web search failed:");
  }
}
