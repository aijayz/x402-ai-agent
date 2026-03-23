import { Ratelimit } from "@upstash/ratelimit";
import type { Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

interface RateLimitConfig {
  requests: number;
  window: Duration;
}

const LIMITS: Record<string, { anon: RateLimitConfig; auth: RateLimitConfig }> = {
  "/api/chat": { anon: { requests: 5, window: "1m" }, auth: { requests: 20, window: "1m" } },
  "/mcp": { anon: { requests: 10, window: "1m" }, auth: { requests: 40, window: "1m" } },
  default: { anon: { requests: 30, window: "1m" }, auth: { requests: 30, window: "1m" } },
};

function getRouteKey(pathname: string): string {
  if (pathname.startsWith("/api/chat")) return "/api/chat";
  if (pathname.startsWith("/mcp")) return "/mcp";
  return "default";
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(routeKey: string, tier: "anon" | "auth"): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const cacheKey = `${routeKey}-${tier}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const config = LIMITS[routeKey]?.[tier] ?? LIMITS.default[tier];
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    prefix: `rl:${routeKey}:${tier}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

const IP_FREE_CALLS_MAX = 2;
const IP_FREE_CALLS_TTL = 86_400; // 24 hours

/**
 * Check and increment IP-based free call counter.
 * Returns { allowed: false } once an IP has used all free calls, regardless
 * of session cookie (closes the cookie-clear bypass).
 * Fails open when Redis is not configured.
 */
export async function checkAndIncrementIpFreeCalls(
  ip: string,
): Promise<{ allowed: boolean }> {
  const r = getRedis();
  if (!r) return { allowed: true };

  const key = `free:ip:${ip}`;
  try {
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, IP_FREE_CALLS_TTL);
    }
    return { allowed: count <= IP_FREE_CALLS_MAX };
  } catch (err) {
    console.error("[RATE_LIMIT] Redis error during IP free-call check, allowing:", err);
    return { allowed: true };
  }
}

/**
 * Decrement IP free call counter (called on error to avoid charging a failed call).
 * Silently ignores errors.
 */
export async function decrementIpFreeCalls(ip: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const key = `free:ip:${ip}`;
    await r.decr(key);
  } catch {
    // Ignore
  }
}

export async function checkRateLimit(
  pathname: string,
  ip: string,
  walletAddress?: string | null,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const routeKey = getRouteKey(pathname);
  const tier = walletAddress ? "auth" : "anon";
  const key = walletAddress ?? ip;

  const limiter = getLimiter(routeKey, tier);
  if (!limiter) return { allowed: true };

  try {
    const result = await limiter.limit(key);
    if (result.success) return { allowed: true };

    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  } catch (err) {
    // Redis unreachable — fail open rather than blocking all requests
    console.error("[RATE_LIMIT] Redis error, allowing request:", err);
    return { allowed: true };
  }
}
