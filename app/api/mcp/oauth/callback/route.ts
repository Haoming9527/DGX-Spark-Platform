import { NextRequest } from "next/server";
import { ApiRequestError } from "@/lib/apiRequest";
import { finishAuthorization } from "@/lib/mcp/oauth";
import { boundedString, mcpAccount } from "@/lib/mcp/request";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  let success = false;
  try {
    const { account, sessionHash } = await mcpAccount(req, false);
    if (req.nextUrl.searchParams.has("error")) throw new ApiRequestError(400, "OAuth was declined.");
    const state = boundedString(req.nextUrl.searchParams.get("state"), "State", 128, true);
    const code = boundedString(req.nextUrl.searchParams.get("code"), "Code", 4096, true);
    const responseIssuer = boundedString(req.nextUrl.searchParams.get("iss") ?? undefined, "Issuer", 2048);
    await finishAuthorization({ userId: account.id, sessionHash, state, code, responseIssuer, origin: req.nextUrl.origin, signal: req.signal });
    success = true;
  } catch { /* Never reflect OAuth query parameters or provider errors. */ }
  return new Response(null, {
    status: 303,
    headers: {
      "Location": `/mcp/authorization?status=${success ? "complete" : "incomplete"}`,
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    },
  });
}
