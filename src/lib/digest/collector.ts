import { createWalletClient, http } from "viem";
import { Redis } from "@upstash/redis";
import { getOrCreatePurchaserAccount, getChain } from "@/lib/accounts";
import { queryDune } from "@/lib/services/dune";
import { getTemplate, isTemplateReady } from "@/lib/services/dune-templates";
import { env } from "@/lib/env";
import { getDigestTokens } from "./tokens";
import {
  reduceWhaleFlow,
  reduceCexFlow,
  reduceStablecoinSupply,
  reduceSentiment,
} from "./reducers";
import type {
  DigestData,
  TokenPrice,
  ReducedWhaleFlow,
  ReducedCexFlow,
  ReducedStablecoinSupply,
  ReducedSentiment,
} from "./types";

// ── Well-known token addresses ──────────────────────────────

const WETH_ETHEREUM = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WBTC_ETHEREUM = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

const DUNE_TOKENS = [
  { token: "ETH", address: WETH_ETHEREUM, chain: "ethereum" },
  { token: "BTC", address: WBTC_ETHEREUM, chain: "ethereum" },
] as const;

// ── Redis for GenVox sentiment cache ────────────────────────

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

const GENVOX_CACHE_TTL_S = 1800; // 30 minutes

// ── Main collector ──────────────────────────────────────────

/**
 * Collect and pre-reduce all digest data sources.
 * Two-phase: prices first (to pick top movers for sentiment), then everything else in parallel.
 * Every sub-collector catches its own errors — the digest generates even with partial data.
 */
export async function collectDigestData(): Promise<DigestData> {
  const errors: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Phase 1: Prices (needed to pick top movers for sentiment)
  let prices: TokenPrice[] = [];
  try {
    prices = await getDigestTokens();
  } catch (err) {
    errors.push(`prices: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Pick top 2 dynamic movers for sentiment (in addition to BTC, ETH)
  const dynamicMovers = prices
    .filter((p) => !p.isFixed)
    .slice(0, 2)
    .map((p) => p.symbol);
  const sentimentTokens = ["BTC", "ETH", ...dynamicMovers];

  // Phase 2: Everything else in parallel
  const [whaleResult, cexResult, stableResult, sentimentResult] =
    await Promise.allSettled([
      collectWhaleFlows(),
      collectCexFlows(),
      collectStablecoinSupply(),
      collectSentiment(sentimentTokens),
    ]);

  return {
    date: today,
    prices,
    whaleFlows: extractSettled(whaleResult, errors, "whale_flows"),
    cexFlows: extractSettled(cexResult, errors, "cex_flows"),
    stablecoinSupply: extractSettled(stableResult, errors, "stablecoin_supply"),
    sentiment: extractSettled(sentimentResult, errors, "sentiment"),
    errors,
  };
}

// ── Sub-collectors ──────────────────────────────────────────

async function collectWhaleFlows(): Promise<ReducedWhaleFlow[]> {
  const tpl = getTemplate("whale_net_flow_7d");
  if (!tpl || !isTemplateReady(tpl)) return [];

  const results = await Promise.all(
    DUNE_TOKENS.map(async ({ token, address, chain }) => {
      const raw = await queryDune("whale_net_flow_7d", tpl.duneQueryId, {
        token_address: address,
        chain,
      }).catch(() => null);
      return reduceWhaleFlow(token, chain, raw);
    }),
  );
  return results;
}

async function collectCexFlows(): Promise<ReducedCexFlow[]> {
  const tpl = getTemplate("cex_net_flow_7d");
  if (!tpl || !isTemplateReady(tpl)) return [];

  const results = await Promise.all(
    DUNE_TOKENS.map(async ({ token, address, chain }) => {
      const raw = await queryDune("cex_net_flow_7d", tpl.duneQueryId, {
        token_address: address,
        chain,
      }).catch(() => null);
      return reduceCexFlow(token, chain, raw);
    }),
  );
  return results;
}

async function collectStablecoinSupply(): Promise<ReducedStablecoinSupply[]> {
  const tpl = getTemplate("stablecoin_supply_trend");
  if (!tpl || !isTemplateReady(tpl)) return [];

  const chains = ["ethereum", "base"];
  const results = await Promise.all(
    chains.map(async (chain) => {
      const raw = await queryDune("stablecoin_supply_trend", tpl.duneQueryId, {
        chain,
      }).catch(() => null);
      return reduceStablecoinSupply(chain, raw);
    }),
  );
  return results;
}

/**
 * Collect GenVox sentiment with Redis caching.
 * Each call costs $0.03 via x402 — cache saves money on repeated queries.
 */
async function collectSentiment(
  tokens: string[],
): Promise<ReducedSentiment[]> {
  const genvoxUrl = env.GENVOX_URL;
  if (!genvoxUrl) {
    console.warn("[DIGEST] GENVOX_URL not configured, skipping sentiment");
    return tokens.map((t) => ({ token: t, score: null, label: null, summary: null }));
  }

  const r = getRedis();

  const results = await Promise.all(
    tokens.map(async (token) => {
      // Check Redis cache
      const cacheKey = `genvox:sentiment:${token.toLowerCase()}`;
      if (r) {
        try {
          const cached = await r.get<unknown>(cacheKey);
          if (cached) return reduceSentiment(token, cached);
        } catch { /* cache miss */ }
      }

      // Fetch via x402 (requires house wallet for payment)
      try {
        const account = await getOrCreatePurchaserAccount();
        const walletClient = createWalletClient({
          account,
          chain: getChain(),
          transport: http(),
        });

        const { callWithPayment } = await import("@/lib/services/payment-handler");
        const result = await callWithPayment(
          `${genvoxUrl}/v1/sentiment/${encodeURIComponent(token)}`,
          undefined,
          { walletClient, userWallet: null },
          { maxPaymentMicroUsdc: 60_000, expectedCostMicroUsdc: 30_000, timeoutMs: 10_000 },
        );

        // Cache successful response
        if (r && result.data) {
          r.set(cacheKey, result.data, { ex: GENVOX_CACHE_TTL_S }).catch(() => {});
        }

        return reduceSentiment(token, result.data);
      } catch (err) {
        console.warn(`[DIGEST] GenVox failed for ${token}:`, err instanceof Error ? err.message : err);
        return { token, score: null, label: null, summary: null };
      }
    }),
  );

  return results;
}

// ── Helpers ──────────────────────────────────────────────────

function extractSettled<T>(
  result: PromiseSettledResult<T[]>,
  errors: string[],
  label: string,
): T[] {
  if (result.status === "fulfilled") return result.value;
  errors.push(`${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  return [];
}
