import { NextRequest } from "next/server";
import { ApiRequestError, readJsonBody } from "@/lib/apiRequest";
import { callMcp } from "@/lib/mcp/client";
import { boundedString, mcpAccount, mcpFailure, mcpJson } from "@/lib/mcp/request";
import { cleanExpiredStates, connectionFor } from "@/lib/mcp/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { account, sessionHash } = await mcpAccount(req);
    const body = await readJsonBody(req, 24576);
    if (body.approved !== true) throw new ApiRequestError(400, "Approve this tool call before running it.");
    const name = boundedString(body.name, "Tool name", 128, true);
    const requestId = boundedString(body.requestId, "Request ID", 36, true);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new ApiRequestError(400, "A new UUID request ID is required for each approved tool call.");
    }
    if (!body.arguments || typeof body.arguments !== "object" || Array.isArray(body.arguments) || JSON.stringify(body.arguments).length > 16384) {
      throw new ApiRequestError(400, "Tool arguments must be a JSON object smaller than 16 KB.");
    }
    await cleanExpiredStates();
    const record = await connectionFor(account.id, (await context.params).id);
    const result = await callMcp(record, {
      name, arguments: body.arguments as Record<string, unknown>, requestId,
      origin: req.nextUrl.origin, sessionHash, signal: req.signal,
    });
    return mcpJson(result);
  } catch (error) { return mcpFailure(error); }
}
