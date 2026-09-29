import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "./prisma";
import { ApiRequestError } from "./apiRequest";

export function clientKey(req: { headers: Headers }): string {
  const header = process.env.VERCEL === "1"
    ? "x-vercel-forwarded-for"
    : process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const address = header ? req.headers.get(header)?.trim() : undefined;
  if (!address || address.includes("%") || !isIP(address)) return "unknown";
  if (isIP(address) === 4) return address;
  return new URL(`http://[${address}]/`).hostname.slice(1, -1);
}

export async function takeRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new ApiRequestError(503, "Service is temporarily unavailable. Try again shortly.");
  const hash = createHmac("sha256", secret).update(`${opts.windowMs}:${key}`).digest("hex");
  try {
    await prisma.$executeRaw`
      DELETE FROM rate_limit_buckets
      WHERE key_hash IN (
        SELECT key_hash FROM rate_limit_buckets
        WHERE expires_at <= statement_timestamp()
        ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
      )
    `;
    const rows = await prisma.$queryRaw<{ requests: number }[]>`
      INSERT INTO rate_limit_buckets (key_hash, requests, expires_at)
      VALUES (${hash}, 1, statement_timestamp() + ${opts.windowMs} * INTERVAL '1 millisecond')
      ON CONFLICT (key_hash) DO UPDATE SET
        requests = CASE WHEN rate_limit_buckets.expires_at <= statement_timestamp()
          THEN 1 ELSE rate_limit_buckets.requests + 1 END,
        expires_at = CASE WHEN rate_limit_buckets.expires_at <= statement_timestamp()
          THEN EXCLUDED.expires_at ELSE rate_limit_buckets.expires_at END
      WHERE rate_limit_buckets.expires_at <= statement_timestamp()
        OR rate_limit_buckets.requests < ${opts.limit}
      RETURNING requests
    `;
    return rows.length === 1;
  } catch (error) {
    console.error("Rate limit storage failed:", error);
    throw new ApiRequestError(503, "Service is temporarily unavailable. Try again shortly.");
  }
}
