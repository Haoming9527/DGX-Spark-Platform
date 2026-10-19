import "server-only";
import { prisma } from "../prisma";
import { ApiRequestError } from "./apiRequest";
import { keyHash, takeRateLimit } from "./rateLimit";


export const GUEST_PER_IP_CONCURRENCY = 2;
export const GUEST_GLOBAL_CONCURRENCY = 4;
export const GUEST_DAILY_REQUESTS = 120;
export const GUEST_DAILY_SEARCHES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEASE_MS = 200_000;

export const GUEST_BUSY = "GUEST_BUSY";
export const GUEST_DAILY_LIMIT = "GUEST_DAILY_LIMIT";

export async function requireGuestDailyAllowance(bucket: string, ip: string, limit: number) {
  if (!await takeRateLimit(`${bucket}:${ip}`, { limit, windowMs: DAY_MS })) {
    throw new ApiRequestError(429, "You've reached today's guest limit. Sign in to keep going, or try again tomorrow.", GUEST_DAILY_LIMIT);
  }
}

export async function acquireGuestStream(ip: string): Promise<string | null> {
  const hash = keyHash(`guest-stream:${ip}`);
  try {
    // One statement (one database round trip). Expired leases are ignored by the counts and deleted occasionally.
    // Without a lock, requests arriving in the same instant can slightly exceed a cap; the caps are abuse limits, not exact quotas.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO guest_streams (key_hash, expires_at)
      SELECT ${hash}::text, statement_timestamp() + ${LEASE_MS}::int * INTERVAL '1 millisecond'
      WHERE (SELECT count(*) FROM guest_streams WHERE key_hash = ${hash}::text AND expires_at > statement_timestamp()) < ${GUEST_PER_IP_CONCURRENCY}::int
        AND (SELECT count(*) FROM guest_streams WHERE expires_at > statement_timestamp()) < ${GUEST_GLOBAL_CONCURRENCY}::int
      RETURNING id::text AS id
    `;
    if (Math.random() < 0.05) {
      prisma.$executeRaw`DELETE FROM guest_streams WHERE expires_at <= statement_timestamp()`
        .catch((error: unknown) => console.error("Guest stream cleanup failed:", error));
    }
    return rows[0]?.id ?? null;
  } catch (error) {
    console.error("Guest stream lease failed:", error);
    throw new ApiRequestError(503, "Service is temporarily unavailable. Try again shortly.");
  }
}

export function guestStreamRelease(id: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    prisma.$executeRaw`DELETE FROM guest_streams WHERE id = ${id}::uuid`
      .catch((error: unknown) => console.error("Guest stream release failed:", error));
  };
}

// Releases the lease when the stream finishes, errors, or the client disconnects.
export function releaseWhenDone(body: ReadableStream<Uint8Array>, release: () => void, signal: AbortSignal) {
  const reader = body.getReader();
  signal.addEventListener("abort", release, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        release();
        controller.error(error);
      }
    },
    cancel(reason) {
      release();
      return reader.cancel(reason);
    },
  });
}
