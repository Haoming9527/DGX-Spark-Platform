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
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP authorization</title></head><body><main><h1>${success ? "MCP authorization complete" : "MCP authorization was not completed"}</h1><p>${success ? "Close this tab, return to your chat, and connect the server again." : "Close this tab and try connecting again from your chat. Your login must stay active in the same browser."}</p></main></body></html>`, {
    status: success ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    },
  });
}
