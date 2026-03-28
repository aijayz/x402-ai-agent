import { TokenSnapshotStore, type TokenSnapshotData } from "./store";
import type { DigestData, TokenPrice } from "@/lib/digest/types";
import { env } from "@/lib/env";
import { getModel, probeModel } from "@/lib/ai-provider";
import { generateText } from "ai";
import { Redis } from "@upstash/redis";

/** CoinGecko IDs for the 4 extra fixed tokens (beyond digest's 6) */
const EXTRA_FIXED: Record<string, string> = {
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  POL: "matic-network",
};

/** All 10 fixed token symbols */
export const FIXED_TOKEN_SYMBOLS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA",
  "DOGE", "AVAX", "LINK", "POL",
];

// ── Redis singleton (same pattern as messari.ts / dune.ts) ──────────
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/** Model fallback chain for lightweight generation */
const FALLBACK_MODELS = [
  env.AI_MODEL ?? "deepseek/deepseek-chat",
  "deepseek/deepseek-chat",
  "google/gemini-2.5-flash",
];

async function getWorkingModel(): Promise<string> {
  for (const id of FALLBACK_MODELS) {
    try {
      await probeModel(id);
      return id;
    } catch { /* try next */ }
  }
  throw new Error("No working model available");
}

/** Generate 2-3 intelligence bullets from token snapshot data */
async function generateIntelligence(
  symbol: string,
  data: TokenSnapshotData,
  modelId: string,
): Promise<string[]> {
  const context: string[] = [`Token: ${data.name} (${symbol})`];
  if (data.price) context.push(`Price: $${data.price}, 24h change: ${data.change24h ?? 0}%`);
  if (data.security?.score != null) context.push(`Security score: ${data.security.score}/100${data.security.details ? ` (${data.security.details})` : ""}`);
  if (data.whaleFlow) {
    if (data.whaleFlow.hasExchangeSplit && data.whaleFlow.netFlowUsd != null) {
      context.push(`Whale net flow 7d: $${(data.whaleFlow.netFlowUsd / 1e6).toFixed(1)}M`);
    } else if (data.whaleFlow.totalVolumeUsd) {
      context.push(`Whale volume 7d: $${(data.whaleFlow.totalVolumeUsd / 1e6).toFixed(1)}M`);
    }
  }
  if (data.sentiment?.score != null) context.push(`Sentiment: ${data.sentiment.score}/100 — ${data.sentiment.label}`);

  try {
    const { text } = await generateText({
      model: getModel(modelId),
      prompt: `Given this token data:\n${context.join("\n")}\n\nGenerate 2-3 concise intelligence bullets (each under 120 chars). Focus on actionable signals — what a trader should notice. Return a JSON array of strings. No markdown, just the JSON array.`,
      maxOutputTokens: 256,
    });
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === "string")) {
      return parsed.slice(0, 3);
    }
    return [];
  } catch (err) {
    console.warn(`[TOKEN-PAGES] Intelligence generation failed for ${symbol}:`, err);
    return [];
  }
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

/** Read Messari unlocks catalog from Redis cache and match symbols */
async function collectUnlocks(
  symbols: string[],
): Promise<Record<string, TokenSnapshotData["unlocks"]>> {
  const result: Record<string, TokenSnapshotData["unlocks"]> = {};
  const r = getRedis();
  if (!r) return result;

  try {
    const tokens = await r.get<TokenUnlockEntry[]>("messari:unlocks:assets");
    if (!tokens || !Array.isArray(tokens)) return result;

    for (const sym of symbols) {
      const upper = sym.toUpperCase();
      const match = tokens.find(
        (t) => t.symbol?.toUpperCase() === upper || t.name?.toUpperCase() === upper,
      );
      if (match) {
        result[upper] = {
          category: match.category,
          sector: match.sector,
          projectedEndDate: match.projectedEndDate,
        };
      }
    }
  } catch (err) {
    console.warn("[TOKEN-PAGES] Failed to read Messari unlocks cache:", err);
  }
  return result;
}

/** Fetch top losers from CoinGecko (top 100 sorted by worst 24h change) */
async function fetchTopLosers(count: number): Promise<TokenPrice[]> {
  const base = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";
  try {
    const res = await fetch(
      `${base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const coins = (await res.json()) as Array<Record<string, unknown>>;
    return coins
      .filter((c) => typeof c.price_change_percentage_24h === "number" && c.price_change_percentage_24h < 0)
      .sort((a, b) => (a.price_change_percentage_24h as number) - (b.price_change_percentage_24h as number))
      .slice(0, count)
      .map((c) => ({
        symbol: String(c.symbol).toUpperCase(),
        name: String(c.name),
        price: Number(c.current_price) || 0,
        change24h: Number(c.price_change_percentage_24h) || 0,
        marketCap: Number(c.market_cap) || 0,
        volume24h: Number(c.total_volume) || 0,
        isFixed: false,
        iconUrl: c.image ? String(c.image) : undefined,
      }));
  } catch {
    console.warn("[TOKEN-PAGES] Failed to fetch top losers");
    return [];
  }
}

/** Fetch extra fixed tokens not in the digest (DOGE, AVAX, LINK, POL) */
async function fetchExtraFixed(): Promise<TokenPrice[]> {
  const ids = Object.values(EXTRA_FIXED).join(",");
  const base = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";
  try {
    const res = await fetch(
      `${base}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const coins = (await res.json()) as Array<Record<string, unknown>>;
    return coins.map((c) => ({
      symbol: String(c.symbol).toUpperCase(),
      name: String(c.name),
      price: Number(c.current_price) || 0,
      change24h: Number(c.price_change_percentage_24h) || 0,
      marketCap: Number(c.market_cap) || 0,
      volume24h: Number(c.total_volume) || 0,
      isFixed: true,
      iconUrl: c.image ? String(c.image) : undefined,
    }));
  } catch {
    console.warn("[TOKEN-PAGES] Failed to fetch extra fixed tokens");
    return [];
  }
}

/** Build snapshot data for a single token price entry using digest data */
function buildSnapshotData(
  price: TokenPrice,
  digestData: DigestData,
): TokenSnapshotData {
  const sym = price.symbol.toUpperCase();
  const whale = digestData.whaleFlows.find((w) => w.token.toUpperCase() === sym) ?? null;
  const sent = digestData.sentiment.find((s) => s.token.toUpperCase() === sym) ?? null;
  const sec = digestData.security?.find((s) => s.symbol.toUpperCase() === sym) ?? null;

  return {
    name: price.name,
    price: price.price,
    change24h: price.change24h,
    marketCap: price.marketCap,
    iconUrl: price.iconUrl,
    whaleFlow: whale ? {
      netFlowUsd: whale.netFlowUsd,
      largeTxCount: whale.largeTxCount,
      totalVolumeUsd: whale.totalVolumeUsd,
      hasExchangeSplit: whale.hasExchangeSplit,
    } : null,
    sentiment: sent ? { score: sent.score, label: sent.label, summary: sent.summary } : null,
    security: sec ? { score: sec.score, details: sec.details } : null,
    unlocks: null,
    intelligence: [],
  };
}

/**
 * Generate token snapshots from digest data.
 * Called after digest generation — uses the already-fetched digest data
 * plus fetches extra fixed tokens and top losers independently.
 */
export async function generateTokenSnapshots(
  digestData: DigestData,
  date: string,
): Promise<number> {
  // Merge all token prices: digest tokens + extra fixed + top losers
  const [extraFixed, topLosers] = await Promise.all([
    fetchExtraFixed(),
    fetchTopLosers(3),
  ]);

  // Deduplicate by symbol (digest tokens take priority)
  const seen = new Set<string>();
  const allPrices: TokenPrice[] = [];

  for (const p of digestData.prices) {
    const sym = p.symbol.toUpperCase();
    if (!seen.has(sym)) {
      seen.add(sym);
      allPrices.push(p);
    }
  }
  for (const p of [...extraFixed, ...topLosers]) {
    const sym = p.symbol.toUpperCase();
    if (!seen.has(sym)) {
      seen.add(sym);
      allPrices.push(p);
    }
  }

  // Build base snapshots
  const snapshots = allPrices.map((price) => ({
    symbol: price.symbol.toUpperCase(),
    price,
    data: buildSnapshotData(price, digestData),
  }));

  // Collect unlocks from Messari Redis cache (free data)
  const allSymbols = snapshots.map((s) => s.symbol);
  const unlocksMap = await collectUnlocks(allSymbols);
  const unlocksFound = Object.keys(unlocksMap).length;
  console.log(`[TOKEN-PAGES] Unlocks: ${unlocksFound}/${allSymbols.length} tokens matched in Messari catalog`);

  // Apply unlocks
  for (const snap of snapshots) {
    snap.data.unlocks = unlocksMap[snap.symbol] ?? null;
  }

  // Generate intelligence bullets in parallel
  let modelId: string | null = null;
  try {
    modelId = await getWorkingModel();
    console.log(`[TOKEN-PAGES] Intelligence model: ${modelId}`);
  } catch {
    console.warn("[TOKEN-PAGES] No working model for intelligence generation — skipping");
  }

  if (modelId) {
    const t0 = Date.now();
    const results = await Promise.allSettled(
      snapshots.map((snap) => generateIntelligence(snap.symbol, snap.data, modelId)),
    );
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < snapshots.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.length > 0) {
        snapshots[i].data.intelligence = r.value;
        successCount++;
      } else if (r.status === "rejected") {
        failCount++;
      }
    }
    console.log(`[TOKEN-PAGES] Intelligence: ${successCount} ok, ${failCount} failed, ${Date.now() - t0}ms`);
  }

  // Upsert all snapshots
  let count = 0;
  for (const snap of snapshots) {
    try {
      await TokenSnapshotStore.upsert(snap.symbol, date, snap.data);
      count++;
    } catch (err) {
      console.error(`[TOKEN-PAGES] Failed to upsert ${snap.symbol}:`, err);
    }
  }

  console.log(`[TOKEN-PAGES] Generated ${count} token snapshots for ${date} (unlocks: ${unlocksFound}, intelligence: ${snapshots.filter(s => s.data.intelligence && s.data.intelligence.length > 0).length})`);
  return count;
}
