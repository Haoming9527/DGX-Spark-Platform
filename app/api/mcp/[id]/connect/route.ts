import { NextRequest } from "next/server";
import { connectMcp } from "@/lib/mcp/client";
import { mcpAccount, mcpFailure, mcpJson } from "@/lib/mcp/request";
import { cleanExpiredStates, connectionFor } from "@/lib/mcp/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { account, sessionHash } = await mcpAccount(req);
    await cleanExpiredStates();
    const record = await connectionFor(account.id, (await context.params).id);
    const result = await connectMcp(record, { origin: req.nextUrl.origin, sessionHash, signal: req.signal });
    return mcpJson(result);
  } catch (error) { return mcpFailure(error); }
}
