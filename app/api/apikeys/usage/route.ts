import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      return NextResponse.json({ error: "Invalid days parameter. Must be 7, 14, or 30." }, { status: 400 });
    }

    // Verify key ownership
    const keyVerify = await query(
      "SELECT id FROM api_keys WHERE id = $1 AND user_id = $2 LIMIT 1",
      [keyId, session.userId]
    );

    if (keyVerify.rows.length === 0) {
      return NextResponse.json({ error: "API Key not found or access denied." }, { status: 404 });
    }

    // Query daily metrics using generate_series to fill gaps with zeros
    const result = await query(
      `SELECT 
          d.date::date AS usage_date,
          COALESCE(SUM(u.tokens), 0)::int AS tokens,
          COALESCE(SUM(u.prompt_tokens), 0)::int AS prompt_tokens,
          COALESCE(SUM(u.completion_tokens), 0)::int AS completion_tokens,
          COALESCE(COUNT(u.id), 0)::int AS requests,
          COALESCE(COUNT(CASE WHEN u.status_code >= 200 AND u.status_code < 300 THEN 1 END), 0)::int AS success_requests,
          COALESCE(COUNT(CASE WHEN u.status_code = 400 THEN 1 END), 0)::int AS error_400,
          COALESCE(COUNT(CASE WHEN u.status_code = 403 THEN 1 END), 0)::int AS error_403,
          COALESCE(COUNT(CASE WHEN u.status_code = 404 THEN 1 END), 0)::int AS error_404
       FROM 
          generate_series(
              CURRENT_DATE - INTERVAL '1 day' * ($2 - 1), 
              CURRENT_DATE, 
              '1 day'::interval
          ) d(date)
       LEFT JOIN 
          api_key_usage u ON u.key_id = $1 AND u.timestamp::date = d.date::date
       GROUP BY 
          d.date
       ORDER BY 
          d.date ASC`,
      [keyId, days]
    );

    const chartData = result.rows.map((row: any) => {
      const dateObj = new Date(row.usage_date);
      const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const requests = row.requests;
      const successRequests = row.success_requests;
      const successRate = requests > 0
        ? Math.max(0, Math.min(100, Math.round((successRequests / requests) * 100)))
        : 100;

      return {
        date: dateStr,
        tokens: row.tokens,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        requests: requests,
        successRate,
        errors: {
          badRequest: row.error_400,
          forbidden: row.error_403,
          notFound: row.error_404,
        },
      };
    });

    return NextResponse.json({ chartData });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("GET api_keys/usage error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
