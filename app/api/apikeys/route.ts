import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../lib/prisma";
import { getSession } from "../../../lib/auth";

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type KeyListRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: Date;
  last_used_at: Date | null;
  total_tokens: number;
  total_requests: number;
};

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await prisma.$queryRaw<KeyListRow[]>`
      SELECT
          k.id,
          k.name,
          k.key_prefix,
          k.created_at,
          k.last_used_at,
          COALESCE(SUM(u.tokens), 0)::float8 AS total_tokens,
          COALESCE(COUNT(u.id), 0)::int AS total_requests
       FROM api_keys k
       LEFT JOIN api_key_usage u ON u.key_id = k.id
       WHERE k.user_id = ${session.userId}::uuid
       GROUP BY k.id
       ORDER BY k.created_at DESC
    `;

    return NextResponse.json({ keys });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("GET api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await req.json();
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Key name is required." }, { status: 400 });
    }
    const safeName = name.trim().replace(/[\x00-\x1F\x7F]/g, "");
    if (safeName.length === 0 || safeName.length > 100) {
      return NextResponse.json(
        { error: "Key name must be between 1 and 100 printable characters." },
        { status: 400 }
      );
    }

    const currentCount = await prisma.apiKey.count({
      where: { userId: session.userId },
    });
    if (currentCount >= 20) {
      return NextResponse.json(
        { error: "Maximum of 20 API keys reached. Please revoke an existing key first." },
        { status: 400 }
      );
    }

    const rawKey = `dgx_sk_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 20);

    const key = await prisma.apiKey.create({
      data: {
        userId: session.userId,
        keyHash,
        keyPrefix,
        name: safeName,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({
      message: "API Key created. Copy it now — it will not be shown again.",
      rawKey,
      key: {
        id: key.id,
        name: key.name,
        key_prefix: key.keyPrefix,
        created_at: key.createdAt,
        last_used_at: key.lastUsedAt,
        total_tokens: 0,
        total_requests: 0,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("POST api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Key ID is required." }, { status: 400 });
    }
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid key ID format." }, { status: 400 });
    }

    const deleted = await prisma.apiKey.deleteMany({
      where: { id, userId: session.userId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("DELETE api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, name } = await req.json();
    if (!id || !name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Key ID and name are required." }, { status: 400 });
    }

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid key ID format." }, { status: 400 });
    }

    const safeName = name.trim().replace(/[\x00-\x1F\x7F]/g, "");
    if (safeName.length === 0 || safeName.length > 100) {
      return NextResponse.json(
        { error: "Key name must be between 1 and 100 printable characters." },
        { status: 400 }
      );
    }

    const updated = await prisma.apiKey.updateMany({
      where: { id, userId: session.userId },
      data: { name: safeName },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({
      message: "API Key renamed successfully.",
      key: { id, name: safeName },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("PATCH api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
