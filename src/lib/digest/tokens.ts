import { env } from "@/lib/env";
import type { TokenPrice } from "./types";

const COINGECKO_BASE = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";

/** 6 fixed majors — always included in the digest */
export const FIXED_MAJORS = [
  "bitcoin",
  "ethereum",
  "solana",
  "binancecoin",
  "ripple",
  "cardano",
] as const;

export const FIXED_SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  binancecoin: "BNB",
  ripple: "XRP",
  cardano: "ADA",
};

const FIXED_SET = new Set<string>(FIXED_MAJORS);

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number;
  total_volume: number;
}

/**
 * Fetch top 10 tokens for the daily digest:
 * - 6 fixed majors (BTC, ETH, SOL, BNB, XRP, ADA)
 * - 4 top gainers from top 100 by market cap (excluding the fixed 6)
 *
 * On CoinGecko error: returns the 6 fixed with zeroed prices (graceful degradation).
 */
export async function getDigestTokens(): Promise<TokenPrice[]> {
  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const markets: CoinGeckoMarket[] = await res.json();

    // Extract the 6 fixed majors
    const fixed: TokenPrice[] = [];
    const rest: TokenPrice[] = [];

    for (const m of markets) {
      const tp: TokenPrice = {
        symbol: m.symbol.toUpperCase(),
        name: m.name,
        price: m.current_price ?? 0,
        change24h: m.price_change_percentage_24h ?? 0,
        marketCap: m.market_cap ?? 0,
        volume24h: m.total_volume ?? 0,
        isFixed: FIXED_SET.has(m.id),
      };

      if (FIXED_SET.has(m.id)) {
        fixed.push(tp);
      } else {
        rest.push(tp);
      }
    }

    // Top 4 gainers from the remaining 94
    rest.sort((a, b) => b.change24h - a.change24h);
    const topGainers = rest.slice(0, 4);

    return [...fixed, ...topGainers];
  } catch (err) {
    console.warn("[DIGEST] CoinGecko fetch failed, using fallback", err);
    // Graceful degradation: return fixed majors with zero prices
    return FIXED_MAJORS.map((id) => ({
      symbol: FIXED_SYMBOLS[id],
      name: id.charAt(0).toUpperCase() + id.slice(1),
      price: 0,
      change24h: 0,
      marketCap: 0,
      volume24h: 0,
      isFixed: true,
    }));
  }
}
