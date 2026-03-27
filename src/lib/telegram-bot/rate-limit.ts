import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redis;
}

type CommandType = "free" | "safe" | "mention";

const LIMITS: Record<CommandType, { max: number; windowSec: number }> = {
  free:    { max: 10, windowSec: 3600 },      // 10/hour per group
  safe:    { max: 5,  windowSec: 3600 },       // 5/hour per group
  mention: { max: 3,  windowSec: 86400 },      // 3/day per group
};

/**
 * Check if a command is allowed for this group. Returns true if allowed.
 * Fail-open: if Redis is unavailable, always allows.
 */
export async function checkGroupLimit(groupId: string | number, type: CommandType): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;

  const limit = LIMITS[type];
  const key = `tgbot:${type}:${groupId}`;

  try {
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, limit.windowSec);
    }
    return count <= limit.max;
  } catch (err) {
    console.error("[TG-BOT] Rate limit check failed:", err);
    return true; // fail-open
  }
}
