import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../lib/db";
import { getSession } from "../../../lib/auth";

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

// RFC-4122 UUID format validator — prevents malformed id values from
// ever reaching the database, even though the driver uses parameterized
// queries. Defense in depth.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET: List API keys for current user
export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await query(
      `SELECT
          k.id,
          k.name,
          k.key_prefix,
          k.created_at,
          k.last_used_at,
          COALESCE(SUM(u.tokens), 0)::float8 AS total_tokens,
          COALESCE(COUNT(u.id), 0)::int AS total_requests
       FROM api_keys k
       LEFT JOIN api_key_usage u ON u.key_id = k.id
       WHERE k.user_id = $1
       GROUP BY k.id
       ORDER BY k.created_at DESC`,
      [session.userId]
    );

    return NextResponse.json({ keys: result.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("GET api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Create a new API key
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
    // Strip any control / non-printable characters from the name
    const safeName = name.trim().replace(/[\x00-\x1F\x7F]/g, "");
    if (safeName.length === 0 || safeName.length > 100) {
      return NextResponse.json({ error: "Key name must be between 1 and 100 printable characters." }, { status: 400 });
    }

    // Limit: max 20 keys per user
    const countResult = await query(
      "SELECT COUNT(*) AS cnt FROM api_keys WHERE user_id = $1",
      [session.userId]
    );
    const currentCount = parseInt(countResult.rows[0]?.cnt || "0", 10);
    if (currentCount >= 20) {
      return NextResponse.json(
        { error: "Maximum of 20 API keys reached. Please revoke an existing key first." },
        { status: 400 }
      );
    }

    // Generate high-entropy key
    const rawKey = `dgx_sk_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    // First 20 chars for display identification (e.g. "dgx_sk_1a2b3c4d5e6f")
    const keyPrefix = rawKey.substring(0, 20);

    const result = await query(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, key_prefix, created_at, last_used_at`,
      [session.userId, keyHash, keyPrefix, safeName]
    );

    // Return the raw key ONLY here — it is never stored in plaintext anywhere else.
    return NextResponse.json({
      message: "API Key created. Copy it now — it will not be shown again.",
      rawKey,
      key: {
        ...result.rows[0],
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

// DELETE: Revoke an API key
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
    // Validate UUID format before touching the DB (defense-in-depth on top
    // of the parameterized query — rejects obviously malformed values early).
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid key ID format." }, { status: 400 });
    }

    const result = await query(
      "DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, session.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    // 204 No Content is the correct HTTP status for a successful DELETE
    // with no response body to return.
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("DELETE api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: Rename an API key
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
      return NextResponse.json({ error: "Key name must be between 1 and 100 printable characters." }, { status: 400 });
    }

    const result = await query(
      `UPDATE api_keys
       SET name = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, name`,
      [safeName, id, session.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ message: "API Key renamed successfully.", key: result.rows[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("PATCH api_keys error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
