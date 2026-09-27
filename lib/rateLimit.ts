type Bucket = number[];

const globalRate = globalThis as typeof globalThis & { __dgxRate?: Map<string, Bucket> };

function store() {
  if (!globalRate.__dgxRate) globalRate.__dgxRate = new Map();
  return globalRate.__dgxRate;
}

export function clientKey(req: { headers: Headers }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function takeRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): boolean {
  const now = Date.now();
  const buckets = store();
  const windowStart = now - opts.windowMs;
  const prev = (buckets.get(key) || []).filter((t) => t > windowStart);
  if (prev.length >= opts.limit) {
    buckets.set(key, prev);
    return false;
  }
  prev.push(now);
  buckets.set(key, prev);
  return true;
}
