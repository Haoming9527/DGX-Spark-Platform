import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { requireAdmin } from "../../../../lib/account";

export async function requireAdminRequest(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const admin = await requireAdmin(session.userId);
  if (!admin) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { admin };
}
