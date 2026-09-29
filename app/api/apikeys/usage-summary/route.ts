import { apiFailure } from "@/lib/apiRequest";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireActiveAccount } from "../../../../lib/requireAccount";
import { filterUsageModels, type ModelUsageRow } from "../../../../lib/usageModels";

const TIMEFRAME_MINUTES = {
  "1h": 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  "30d": 30 * 24 * 60,
} as const;

type Timeframe = keyof typeof TIMEFRAME_MINUTES;

type UsageSummaryRow = {
  id: string;
  tokens: number;
  requests: number;
};

export async function GET(req: NextRequest) {
  try {
    const gate = await requireActiveAccount(req);
    if (gate.error) return gate.error;

    const { searchParams } = new URL(req.url);
    const timeframeParam = searchParams.get("timeframe") || "7d";

    if (!Object.hasOwn(TIMEFRAME_MINUTES, timeframeParam)) {
      return NextResponse.json(
        { error: "Invalid timeframe parameter. Must be 1h, 24h, 7d, or 30d." },
        { status: 400 }
      );
    }

    const timeframe = timeframeParam as Timeframe;
    const minutes = TIMEFRAME_MINUTES[timeframe];

    const usage = await prisma.$queryRaw<UsageSummaryRow[]>`
      SELECT
          k.id,
          COALESCE(SUM(u.tokens), 0)::float8 AS tokens,
          COALESCE(COUNT(u.id), 0)::int AS requests
       FROM api_keys k
       LEFT JOIN api_key_usage u
          ON u.key_id = k.id
         AND u.timestamp >= NOW() - make_interval(mins => ${minutes})
       WHERE k.user_id = ${gate.account.id}::uuid
       GROUP BY k.id
    `;

    const byModelRaw = await prisma.$queryRaw<ModelUsageRow[]>`
      SELECT
          COALESCE(u.model, '') AS model,
          COUNT(u.id)::int AS requests,
          COALESCE(SUM(u.tokens), 0)::float8 AS tokens
       FROM api_keys k
       JOIN api_key_usage u
          ON u.key_id = k.id
         AND u.timestamp >= NOW() - make_interval(mins => ${minutes})
       WHERE k.user_id = ${gate.account.id}::uuid
       GROUP BY u.model
       ORDER BY requests DESC
    `;
    const byModel = await filterUsageModels(
      gate.account.id,
      byModelRaw.map((row) => ({
        model: row.model || "Unknown",
        requests: row.requests,
        tokens: row.tokens,
      })),
    );

    return NextResponse.json({ usage, byModel });
  } catch (error: unknown) {
    return apiFailure(error, "apikeys/usage-summary request failed:");
  }
}
