import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAdminRequest } from "../../../../lib/requireAdminRequest";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdminRequest(req);
    if (gate.error) return gate.error;

    const rows = await prisma.restrictedAccessAudit.findMany({
      orderBy: { at: "desc" },
      take: 100,
    });
    return NextResponse.json({
      events: rows.map((r) => ({
        id: r.id,
        at: r.at,
        userId: r.userId,
        keyId: r.keyId,
        modelName: r.modelName,
        action: r.action,
        statusCode: r.statusCode,
        path: r.path,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
