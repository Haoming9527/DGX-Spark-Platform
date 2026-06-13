import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

const TIMEFRAME_INTERVALS = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
} as const;

type Timeframe = keyof typeof TIMEFRAME_INTERVALS;

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const timeframeParam = searchParams.get("timeframe") || "7d";

    if (!Object.hasOwn(TIMEFRAME_INTERVALS, timeframeParam)) {
      return NextResponse.json(
        { error: "Invalid timeframe parameter. Must be 1h, 24h, 7d, or 30d." },
        { status: 400 }
      );
    }

    const timeframe = timeframeParam as Timeframe;

    const result = await query(
      `SELECT
          k.id,
          COALESCE(SUM(u.tokens), 0)::float8 AS tokens,
          COALESCE(COUNT(u.id), 0)::int AS requests
       FROM api_keys k
       LEFT JOIN api_key_usage u
          ON u.key_id = k.id
         AND u.timestamp >= NOW() - $2::interval
       WHERE k.user_id = $1
       GROUP BY k.id`,
      [session.userId, TIMEFRAME_INTERVALS[timeframe]]
    );

    return NextResponse.json({ usage: result.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("GET api_keys/usage-summary error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
