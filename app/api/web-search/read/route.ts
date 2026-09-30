import { NextRequest, NextResponse } from "next/server";
import { ApiRequestError, apiFailure, readJsonBody } from "../../../../lib/apiRequest";
import { unauthorizedResponse } from "../../../../lib/auth";
import { loadOptionalAccount } from "../../../../lib/requireAccount";
import { clientKey, takeRateLimit } from "../../../../lib/rateLimit";
import { readWebPage } from "../../../../lib/webSearch";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin) {
      throw new ApiRequestError(403, "Page reading is available from this website.");
    }
    const { account, clearCookie } = await loadOptionalAccount(req);
    if (clearCookie) return unauthorizedResponse(true);
    const bucket = account ? `web-read:${account.id}` : `web-read-anon:${clientKey(req)}`;
    if (!await takeRateLimit(bucket, { limit: account ? 12 : 6, windowMs: 60_000 })) {
      throw new ApiRequestError(429, "Too many page requests. Please wait a moment.");
    }
    if (!account && !await takeRateLimit(`${bucket}:hour`, { limit: 24, windowMs: 3_600_000 })) {
      throw new ApiRequestError(429, "Page reading limit reached. Please try again later.");
    }
    const { url, query } = await readJsonBody(req, 8192);
    if (typeof url !== "string" || !url.trim() || url.length > 2048) {
      throw new ApiRequestError(400, "Enter a public HTTPS page URL of up to 2,048 characters.");
    }
    if (query !== undefined && (typeof query !== "string" || query.length > 1000)) {
      throw new ApiRequestError(400, "The reading focus must be text of up to 1,000 characters.");
    }
    const source = await readWebPage(url.trim(), req.signal, typeof query === "string" ? query.trim() : "");
    return NextResponse.json({ source, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, "Web page reading failed:");
  }
}
