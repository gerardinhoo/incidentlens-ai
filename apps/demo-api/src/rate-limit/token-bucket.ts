export type TokenBucketLimiter = {
  take: (
    key: string,
    nowMs?: number,
  ) => { ok: true } | { ok: false; retryAfterSec: number };
};

/**
 * In-memory token bucket (per Lambda instance). Demo-scale: resets on cold start.
 */
export function createTokenBucketLimiter(options: {
  capacity: number;
  refillPerMinute: number;
}): TokenBucketLimiter {
  const { capacity, refillPerMinute } = options;
  const refillPerMs = refillPerMinute / 60_000;
  const buckets = new Map<string, { tokens: number; updatedAt: number }>();

  return {
    take(key, nowMs = Date.now()) {
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = { tokens: capacity, updatedAt: nowMs };
        buckets.set(key, bucket);
      } else {
        const elapsed = Math.max(0, nowMs - bucket.updatedAt);
        bucket.tokens = Math.min(
          capacity,
          bucket.tokens + elapsed * refillPerMs,
        );
        bucket.updatedAt = nowMs;
      }

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { ok: true };
      }

      const deficit = 1 - bucket.tokens;
      const retryAfterMs = refillPerMs > 0 ? deficit / refillPerMs : 60_000;
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    },
  };
}

export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp: string,
): string {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const first = raw.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  return fallbackIp.length > 0 ? fallbackIp : 'unknown';
}
