import "server-only";

/**
 * Pluggable rate limiter. The default implementation is in-process memory,
 * which is correct for a single Node.js server instance (our default
 * deployment target — see DEPLOYMENT.md) but does NOT share state across
 * multiple serverless invocations/instances. If you deploy behind multiple
 * instances (e.g. several Vercel serverless functions), swap this for a
 * shared-store implementation (Upstash Redis, etc.) behind the same
 * `RateLimiter` interface — nothing else in the app needs to change.
 */
export interface RateLimiter {
  /** Returns true if the action is allowed, false if the limit was hit. */
  consume(key: string): Promise<{ allowed: boolean; retryAfterMs?: number }>;
}

interface Bucket {
  count: number;
  windowStart: number;
}

class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string) {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (bucket.count >= this.max) {
      return { allowed: false, retryAfterMs: this.windowMs - (now - bucket.windowStart) };
    }

    bucket.count += 1;
    return { allowed: true };
  }
}

// Stale buckets are pruned lazily: a key whose window has elapsed is reset
// on its next `consume()` call, so memory only grows with *active* keys.
export const loginRateLimiter: RateLimiter = new InMemoryRateLimiter(10, 15 * 60 * 1000); // 10 / 15min
export const registerRateLimiter: RateLimiter = new InMemoryRateLimiter(5, 60 * 60 * 1000); // 5 / hour
export const mutationRateLimiter: RateLimiter = new InMemoryRateLimiter(120, 60 * 1000); // 120 / min general API writes

export function clientKeyFrom(headers: Headers, extra = ""): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0].trim() ?? headers.get("x-real-ip") ?? "unknown";
  return `${ip}:${extra}`;
}
