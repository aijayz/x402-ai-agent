import { createWalletClient, http } from "viem";
import { Redis } from "@upstash/redis";
import { getOrCreatePurchaserAccount, getChain } from "@/lib/accounts";
import { queryDune } from "@/lib/services/dune";
import { getTemplate, isTemplateReady } from "@/lib/services/dune-templates";
import { env } from "@/lib/env";
import { getDigestTokens } from "./tokens";
import { FIXED_TOKEN_SYMBOLS } from "@/lib/token-pages/generator";
import {
  reduceWhaleFlowWithSplit,
  reduceWhaleFlowVolumeOnly,
  reduceStablecoinSupply,
  reduceSentiment,
} from "./reducers";
import type {
  DigestData,
  TokenPrice,
  ReducedWhaleFlow,
  ReducedStablecoinSupply,
  ReducedSentiment,
  ReducedSecurity,
} from "./types";

// ── ERC-20 token addresses on Ethereum ──────────────────────

/** symbol → Ethereum contract address (for the consolidated whale_flow_ethereum query) */
const ETHEREUM_TOKEN_ADDRESSES: Record<string, string> = {
  ETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",   // WETH (also catches native ETH via traces)
  BTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",   // WBTC (Ethereum-wrapped)
  LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
  AVAX: "0x85f138bfEE4ef8e540890CFb48F620571d67Eda3",  // Wrapped AVAX on Ethereum
  POL:  "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6",  // POL (ex-MATIC) on Ethereum
};

/** Reverse lookup: lowercase contract_address → symbol */
const ADDRESS_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(ETHEREUM_TOKEN_ADDRESSES).map(([sym, addr]) => [addr.toLowerCase(), sym]),
);

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

  // Sentiment for ALL 10 fixed tokens + top dynamic movers
  const dynamicMovers = prices
    .filter((p) => !p.isFixed)
    .slice(0, 4)
    .map((p) => p.symbol);
  const sentimentTokens = [...new Set([...FIXED_TOKEN_SYMBOLS, ...dynamicMovers])];

  // Security for all tokens (fixed + dynamic)
  const allSymbols = [...new Set([...FIXED_TOKEN_SYMBOLS, ...prices.map((p) => p.symbol)])];

  // Phase 2: Everything else in parallel
  const [whaleEthResult, whaleBtcResult, whaleSolResult, whaleBnbResult, stableResult, sentimentResult, securityResult] =
    await Promise.allSettled([
      collectEthereumWhaleFlows(),
      collectNativeWhaleFlow("whale_flow_bitcoin", "BTC", "bitcoin"),
      collectNativeWhaleFlow("whale_flow_solana", "SOL", "solana"),
      collectNativeWhaleFlow("whale_flow_bnb", "BNB", "bnb"),
      collectStablecoinSupply(),
      collectSentiment(sentimentTokens),
      collectSecurity(allSymbols),
    ]);

  // Merge all whale flows into one array
  const whaleFlows: ReducedWhaleFlow[] = [
    ...extractSettled(whaleEthResult, errors, "whale_ethereum"),
    ...extractSettledSingle(whaleBtcResult, errors, "whale_bitcoin"),
    ...extractSettledSingle(whaleSolResult, errors, "whale_solana"),
    ...extractSettledSingle(whaleBnbResult, errors, "whale_bnb"),
  ];

  return {
    date: today,
    prices,
    whaleFlows,
    stablecoinSupply: extractSettled(stableResult, errors, "stablecoin_supply"),
    sentiment: extractSettled(sentimentResult, errors, "sentiment"),
    security: extractSettled(securityResult, errors, "security"),
    errors,
  };
}

// ── Sub-collectors ──────────────────────────────────────────

/**
 * Consolidated Ethereum whale flow: one query for ALL ERC-20 tokens.
 * Returns one ReducedWhaleFlow per token found in the response.
 */
async function collectEthereumWhaleFlows(): Promise<ReducedWhaleFlow[]> {
  const tpl = getTemplate("whale_flow_ethereum");
  if (!tpl || !isTemplateReady(tpl)) return [];

  // Build comma-separated hex address list for the SQL IN clause
  const addresses = Object.values(ETHEREUM_TOKEN_ADDRESSES);
  const tokenAddresses = addresses.join(",");

  const raw = await queryDune("whale_flow_ethereum", tpl.duneQueryId, {
    token_addresses: tokenAddresses,
  }, { fastPathOnly: true }).catch(() => null);

  if (!raw?.rows?.length) return [];

  // Group rows by contract_address → symbol
  const byToken: Record<string, Record<string, unknown>[]> = {};
  for (const row of raw.rows) {
    const addr = String(row.contract_address ?? "").toLowerCase();
    const symbol = ADDRESS_TO_SYMBOL[addr];
    if (symbol) {
      if (!byToken[symbol]) byToken[symbol] = [];
      byToken[symbol].push(row);
    }
  }

  // Reduce each token's rows
  return Object.entries(byToken).map(([symbol, rows]) =>
    reduceWhaleFlowWithSplit(symbol, "ethereum", rows),
  );
}

/**
 * Native chain whale flow (BTC, SOL, BNB) — volume-only, no exchange split.
 */
async function collectNativeWhaleFlow(
  templateName: string,
  token: string,
  chain: string,
): Promise<ReducedWhaleFlow> {
  const tpl = getTemplate(templateName);
  if (!tpl || !isTemplateReady(tpl)) {
    return { token, chain, netFlowUsd: 0, inflowUsd: 0, outflowUsd: 0, largeTxCount: 0, totalVolumeUsd: 0, hasExchangeSplit: false };
  }

  const raw = await queryDune(templateName, tpl.duneQueryId, {}, { fastPathOnly: true }).catch(() => null);
  return reduceWhaleFlowVolumeOnly(token, chain, raw);
}

async function collectStablecoinSupply(): Promise<ReducedStablecoinSupply[]> {
  const tpl = getTemplate("stablecoin_supply_trend");
  if (!tpl || !isTemplateReady(tpl)) return [];

  const chains = ["ethereum", "base"];
  const results = await Promise.all(
    chains.map(async (chain) => {
      const raw = await queryDune("stablecoin_supply_trend", tpl.duneQueryId, {
        chain,
      }, { fastPathOnly: true }).catch(() => null);
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

// ── Security scores (hardcoded blue chips + QuantumShield for unknowns) ──

const SECURITY_HARDCODED: Record<string, { score: number; details: string }> = {
  BTC:  { score: 95, details: "Blue-chip native asset" },
  ETH:  { score: 95, details: "Blue-chip native asset" },
  SOL:  { score: 95, details: "Blue-chip native asset" },
  BNB:  { score: 95, details: "Blue-chip native asset" },
  XRP:  { score: 95, details: "Blue-chip native asset" },
  ADA:  { score: 95, details: "Blue-chip native asset" },
  DOGE: { score: 95, details: "Blue-chip native asset" },
  LINK: { score: 90, details: "Blue-chip ERC-20" },
  AAVE: { score: 90, details: "Blue-chip ERC-20" },
  POL:  { score: 90, details: "Blue-chip ERC-20" },
  AVAX: { score: 90, details: "Blue-chip ERC-20" },
};

async function collectSecurity(
  symbols: string[],
): Promise<ReducedSecurity[]> {
  const results: ReducedSecurity[] = [];

  for (const sym of symbols) {
    const hardcoded = SECURITY_HARDCODED[sym];
    if (hardcoded) {
      results.push({ symbol: sym, ...hardcoded });
      continue;
    }
    // Dynamic token: try QuantumShield (direct fetch, skip on 402)
    const address = ETHEREUM_TOKEN_ADDRESSES[sym];
    if (!address || !env.QUANTUM_SHIELD_URL) continue;
    try {
      const res = await fetch(
        `${env.QUANTUM_SHIELD_URL}/api/token/security?address=${address}&chain=eth`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.status === 402 || !res.ok) continue;
      const data = await res.json();
      const score = typeof data?.score === "number" ? data.score : null;
      if (score != null) {
        results.push({ symbol: sym, score, details: data.details ?? "" });
      }
    } catch {
      console.warn(`[DIGEST] QS security failed for ${sym}`);
    }
  }
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

function extractSettledSingle<T>(
  result: PromiseSettledResult<T>,
  errors: string[],
  label: string,
): T[] {
  if (result.status === "fulfilled") return [result.value];
  errors.push(`${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  return [];
}
