import { NextRequest } from "next/server";
import { mcpAccount, mcpFailure, mcpJson } from "@/lib/mcp/request";
import { forgetConnection } from "@/lib/mcp/storage";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { account } = await mcpAccount(req);
    await forgetConnection(account.id, (await context.params).id);
    return mcpJson({ ok: true });
  } catch (error) { return mcpFailure(error); }
}
