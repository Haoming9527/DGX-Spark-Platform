import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../lib/prisma";
import { requireActiveAccount } from "../../../lib/requireAccount";
import { ApiRequestError, apiFailure, readJsonBody } from "../../../lib/apiRequest";

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
    const gate = await requireActiveAccount(req);
    if (gate.error) return gate.error;

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
       WHERE k.user_id = ${gate.account.id}::uuid
       GROUP BY k.id
       ORDER BY k.created_at DESC
    `;

    return NextResponse.json({ keys });
  } catch (error: unknown) {
    return apiFailure(error, "apikeys request failed:");
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireActiveAccount(req);
    if (gate.error) return gate.error;

    const { name } = await readJsonBody(req);
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

    const rawKey = `dgx_sk_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 20);

    const key = await prisma.$transaction(async (tx) => {
      const accounts = await tx.$queryRaw<{ disabled: boolean }[]>`
        SELECT (disabled_at IS NOT NULL) AS disabled FROM users
        WHERE id = ${gate.account.id}::uuid FOR UPDATE
      `;
      if (!accounts[0] || accounts[0].disabled) throw new ApiRequestError(401, "Unauthorized");
      const currentCount = await tx.apiKey.count({ where: { userId: gate.account.id } });
      if (currentCount >= 20) {
        throw new ApiRequestError(400, "Maximum of 20 API keys reached. Please revoke an existing key first.");
      }
      return tx.apiKey.create({
        data: { userId: gate.account.id, keyHash, keyPrefix, name: safeName },
        select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
      });
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
    return apiFailure(error, "apikeys request failed:");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireActiveAccount(req);
    if (gate.error) return gate.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Key ID is required." }, { status: 400 });
    }
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid key ID format." }, { status: 400 });
    }

    const deleted = await prisma.apiKey.deleteMany({
      where: { id, userId: gate.account.id },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    return apiFailure(error, "apikeys request failed:");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireActiveAccount(req);
    if (gate.error) return gate.error;

    const { id, name } = await readJsonBody(req);
    if (typeof id !== "string" || !id || !name || typeof name !== "string" || !name.trim()) {
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
      where: { id, userId: gate.account.id },
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
    return apiFailure(error, "apikeys request failed:");
  }
}
