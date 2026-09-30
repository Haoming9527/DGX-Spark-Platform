import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken } from "../auth";
import { loadAccount } from "../account";
import { ApiRequestError } from "../apiRequest";
import { takeRateLimit } from "../rateLimit";
import { digest } from "./crypto";

export async function mcpAccount(req: NextRequest, mutation = true, limit = 20) {
  if (mutation && req.headers.get("origin") !== req.nextUrl.origin) {
    throw new ApiRequestError(403, "MCP changes must be made from this website.");
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const session = cookie ? verifyToken(cookie) : null;
  if (!session || !cookie) throw new ApiRequestError(401, "Sign in to use MCP connections.");
  const account = await loadAccount(session.userId);
  if (!account || account.disabled) throw new ApiRequestError(401, "Sign in with an active account to use MCP connections.");
  if (!await takeRateLimit(`mcp:${account.id}`, { limit, windowMs: 60000 })) {
    throw new ApiRequestError(429, "Too many MCP requests. Try again shortly.");
  }
  return { account, sessionHash: digest(cookie) };
}

export function mcpFailure(error: unknown) {
  const status = error instanceof ApiRequestError ? error.status : 502;
  const message = error instanceof ApiRequestError ? error.message : "Could not connect to the MCP server. Check its URL, authentication, and availability.";
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function mcpJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function boundedString(value: unknown, name: string, limit: number, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || (required && !value.trim())) {
    throw new ApiRequestError(400, `${name} is missing or invalid.`);
  }
  return value.trim();
}
