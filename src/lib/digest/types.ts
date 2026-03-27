// ── Token prices (from CoinGecko) ────────────────────────────

export interface TokenPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number; // percentage
  marketCap: number;
  volume24h: number;
  isFixed: boolean; // true for the 6 majors, false for dynamic top-gainer slots
  iconUrl?: string; // CoinGecko token image URL
}

// ── Reduced types (headline numbers passed to AI) ────────────

export interface ReducedWhaleFlow {
  token: string; // "ETH"
  chain: string; // "ethereum"
  netFlowUsd: number; // negative = outflow (accumulation)
  inflowUsd: number;
  outflowUsd: number;
  largeTxCount: number; // transfers > $100k
}

export interface ReducedCexFlow {
  token: string;
  chain: string;
  netFlowUsd: number; // negative = exchange outflow (bullish)
  direction: "inflow" | "outflow" | "neutral";
}

export interface ReducedStablecoinSupply {
  chain: string;
  currentSupplyUsd: number;
  change30dUsd: number;
  changePercent: number;
}

export interface ReducedSentiment {
  token: string;
  score: number | null; // 0-100 or null if unavailable
  label: string | null; // "bullish", "bearish", "neutral"
  summary: string | null; // one-sentence from GenVox
}

// ── Digest payload (compact ~3KB, safe for any model) ────────

export interface DigestData {
  date: string; // "2026-03-27"
  prices: TokenPrice[];
  whaleFlows: ReducedWhaleFlow[];
  cexFlows: ReducedCexFlow[];
  stablecoinSupply: ReducedStablecoinSupply[];
  sentiment: ReducedSentiment[];
  errors: string[]; // sources that failed (for metadata tracking)
}
