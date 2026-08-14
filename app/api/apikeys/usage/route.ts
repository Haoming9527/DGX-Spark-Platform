import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSession } from "../../../../lib/auth";
import { filterUsageModels, type ModelUsageRow } from "../../../../lib/usageModels";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UsageRow = {
  usage_date: Date;
  tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  requests: number;
  success_requests: number;
  error_400: number;
  error_403: number;
  error_404: number;
};

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get("id");
    const daysParam = searchParams.get("days");

    if (!keyId) {
      return NextResponse.json({ error: "Key ID is required." }, { status: 400 });
    }

    if (!UUID_REGEX.test(keyId)) {
      return NextResponse.json({ error: "Invalid key ID format." }, { status: 400 });
    }

    const days = daysParam ? parseInt(daysParam, 10) : 14;
    if (![7, 14, 30].includes(days)) {
      return NextResponse.json(
        { error: "Invalid days parameter. Must be 7, 14, or 30." },
        { status: 400 }
      );
    }

    const owned = await prisma.apiKey.findFirst({
      where: { id: keyId, userId: session.userId },
      select: { id: true },
    });

    if (!owned) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    const rows = await prisma.$queryRaw<UsageRow[]>`
      SELECT
          d.date::date AS usage_date,
          COALESCE(SUM(u.tokens), 0)::float8 AS tokens,
          COALESCE(SUM(u.prompt_tokens), 0)::float8 AS prompt_tokens,
          COALESCE(SUM(u.completion_tokens), 0)::float8 AS completion_tokens,
          COALESCE(COUNT(u.id), 0)::int AS requests,
          COALESCE(COUNT(CASE WHEN u.status_code >= 200 AND u.status_code < 300 THEN 1 END), 0)::int AS success_requests,
          COALESCE(COUNT(CASE WHEN u.status_code = 400 THEN 1 END), 0)::int AS error_400,
          COALESCE(COUNT(CASE WHEN u.status_code = 403 THEN 1 END), 0)::int AS error_403,
          COALESCE(COUNT(CASE WHEN u.status_code = 404 THEN 1 END), 0)::int AS error_404
       FROM
          generate_series(
              CURRENT_DATE - make_interval(days => ${days - 1}),
              CURRENT_DATE,
              INTERVAL '1 day'
          ) d(date)
       LEFT JOIN
          api_key_usage u ON u.key_id = ${keyId}::uuid AND u.timestamp::date = d.date::date
       GROUP BY
          d.date
       ORDER BY
          d.date ASC
    `;

    const chartData = rows.map((row) => {
      const dateObj = new Date(row.usage_date);
      const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const requests = row.requests;
      const successRequests = row.success_requests;
      const successRate =
        requests > 0
          ? Math.max(0, Math.min(100, Math.round((successRequests / requests) * 100)))
          : 100;

      return {
        date: dateStr,
        tokens: row.tokens,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        requests,
        successRate,
        errors: {
          badRequest: row.error_400,
          forbidden: row.error_403,
          notFound: row.error_404,
        },
      };
    });

    const byModelRaw = await prisma.$queryRaw<ModelUsageRow[]>`
      SELECT
          COALESCE(u.model, '') AS model,
          COUNT(u.id)::int AS requests,
          COALESCE(SUM(u.tokens), 0)::float8 AS tokens
       FROM api_key_usage u
       WHERE u.key_id = ${keyId}::uuid
         AND u.timestamp >= CURRENT_DATE - make_interval(days => ${days - 1})
       GROUP BY u.model
       ORDER BY requests DESC
    `;
    const byModel = await filterUsageModels(
      session.userId,
      byModelRaw.map((row) => ({
        model: row.model || "Unknown",
        requests: row.requests,
        tokens: row.tokens,
      })),
    );

    return NextResponse.json({ chartData, byModel });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("GET api_keys/usage error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
