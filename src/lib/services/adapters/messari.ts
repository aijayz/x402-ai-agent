import { Redis } from "@upstash/redis";
import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

const MESSARI_BASE = env.MESSARI_URL ?? "https://api.messari.io";

// ── Redis cache (same singleton pattern as dune.ts) ──────────────
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

const ALLOCATIONS_CACHE_TTL_S = 86_400; // 24 hours
const UNLOCKS_CACHE_TTL_S = 86_400; // 24 hours (asset catalog rarely changes)

interface MessariTokenUnlocksInput {
  target: string; // token name, symbol, or slug
}

interface TokenUnlockEntry {
  symbol: string;
  name: string;
  slug: string;
  genesisDate: string | null;
  projectedEndDate: string | null;
  category: string | null;
  sector: string | null;
  tags: string[] | null;
}

interface MessariTokenUnlocksOutput {
  found: boolean;
  token?: TokenUnlockEntry;
  source: string;
}

/**
 * Messari token unlock catalog — free endpoint, no x402 payment required.
 * Returns Messari's institutional classification (category, sector, tags,
 * genesis date) and unlock schedule for a token, if known.
 */
export const messariTokenUnlocksAdapter: X402ServiceAdapter<MessariTokenUnlocksInput, MessariTokenUnlocksOutput> = {
  name: "Messari",
  estimatedCostMicroUsdc: 0,
  async call(input: MessariTokenUnlocksInput, _ctx: PaymentContext): Promise<X402ServiceResponse<MessariTokenUnlocksOutput>> {
    // Try Redis cache for full asset list
    const r = getRedis();
    const cacheKey = "messari:unlocks:assets";
    let tokens: TokenUnlockEntry[] | null = null;

    if (r) {
      try {
        tokens = await r.get<TokenUnlockEntry[]>(cacheKey);
      } catch { /* cache miss */ }
    }

    if (!tokens) {
      const res = await fetch(`${MESSARI_BASE}/token-unlocks/v1/assets`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`Messari token-unlocks returned ${res.status}`);
      }
      const body = await res.json() as { data?: TokenUnlockEntry[] };
      tokens = body.data ?? [];

      if (r && tokens.length > 0) {
        r.set(cacheKey, tokens, { ex: UNLOCKS_CACHE_TTL_S }).catch(() => {});
      }
    }

    // Case-insensitive match on symbol, name, or slug
    const search = input.target.toLowerCase().replace(/^0x[0-9a-f]+$/i, ""); // skip if raw address
    const match = search
      ? tokens.find(t =>
          t.symbol?.toLowerCase() === search ||
          t.name?.toLowerCase() === search ||
          t.slug?.toLowerCase() === search ||
          t.name?.toLowerCase().includes(search) ||
          t.symbol?.toLowerCase().includes(search)
        )
      : undefined;

    return {
      data: {
        found: !!match,
        token: match,
        source: "Messari token-unlocks catalog",
      },
      cost: 0,
      source: "Messari",
    };
  },
};

// --- Messari Allocations (x402 v2, paid) ---

interface MessariAllocationsInput {
  assetSymbol: string; // e.g. "ARB", "OP", "ETH"
}

/**
 * Messari token allocations — paid x402 v2 endpoint ($0.25/call).
 * Returns detailed token allocation breakdowns: investor, team,
 * foundation, ecosystem, community splits with vesting schedules.
 */
/** Extract a single token's allocation from the full Messari response. */
function extractAllocation(fullResponse: Record<string, unknown>, symbol: string): Record<string, unknown> | null {
  const data = fullResponse?.data;
  if (!Array.isArray(data)) return null;
  const upper = symbol.toUpperCase();
  const match = data.find((item: Record<string, unknown>) => {
    const asset = item?.asset as Record<string, unknown> | undefined;
    return asset?.symbol?.toString().toUpperCase() === upper;
  }) as Record<string, unknown> | undefined;
  return match ?? null;
}

export const messariAllocationsAdapter: X402ServiceAdapter<MessariAllocationsInput, unknown> = {
  name: "Messari Allocations",
  estimatedCostMicroUsdc: 250_000,
  async call(input: MessariAllocationsInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const symbol = input.assetSymbol.toUpperCase();
    const r = getRedis();
    const globalCacheKey = "messari:alloc:all";

    // Check Redis for the full allocations dataset (one $0.25 call serves all tokens for 24h)
    if (r) {
      try {
        const cached = await r.get<Record<string, unknown>>(globalCacheKey);
        if (cached) {
          const match = extractAllocation(cached, symbol);
          return {
            data: match ?? { found: false, symbol, message: "No allocation data available for this token" },
            cost: match ? 250_000 : 0, // charge only if we returned useful data
            source: "Messari Allocations (cached)",
          };
        }
      } catch { /* cache miss */ }
    }

    const result = await callWithPayment(
      `${MESSARI_BASE}/token-unlocks/v1/allocations?assetSymbol=${encodeURIComponent(input.assetSymbol)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 500_000, expectedCostMicroUsdc: 250_000, timeoutMs: 15_000 },
    );

    // Cache the FULL response (all 253 tokens) under one key — next query for any token is free for us
    const fullData = result.data as Record<string, unknown> | undefined;
    if (r && fullData) {
      r.set(globalCacheKey, fullData, { ex: ALLOCATIONS_CACHE_TTL_S }).catch(() => {});
    }

    // Return only the matched token to keep LLM context small
    const match = fullData ? extractAllocation(fullData, symbol) : null;
    return {
      data: match ?? { found: false, symbol, message: "No allocation data available for this token" },
      cost: match ? result.costMicroUsdc : 0, // don't charge user if no useful data returned
      source: "Messari Allocations",
    };
  },
};
