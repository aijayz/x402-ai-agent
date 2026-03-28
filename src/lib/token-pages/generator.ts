import { TokenSnapshotStore, type TokenSnapshotData } from "./store";
import type { DigestData, TokenPrice } from "@/lib/digest/types";
import { env } from "@/lib/env";

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
    cexFlow: null, // Merged into whaleFlow (exchange split is part of whale_flow_ethereum)
    sentiment: sent ? { score: sent.score, label: sent.label, summary: sent.summary } : null,
    security: null,
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

  // Generate and upsert snapshots
  let count = 0;
  for (const price of allPrices) {
    try {
      const data = buildSnapshotData(price, digestData);
      await TokenSnapshotStore.upsert(price.symbol, date, data);
      count++;
    } catch (err) {
      console.error(`[TOKEN-PAGES] Failed to upsert ${price.symbol}:`, err);
    }
  }

  console.log(`[TOKEN-PAGES] Generated ${count} token snapshots for ${date}`);
  return count;
}
