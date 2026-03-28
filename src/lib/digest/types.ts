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
  token: string; // "ETH", "BTC", "SOL", "BNB", "LINK", etc.
  chain: string; // "ethereum", "bitcoin", "solana", "bnb"
  netFlowUsd: number; // inflow - outflow (positive = bullish accumulation)
  inflowUsd: number; // tokens leaving exchanges → wallets
  outflowUsd: number; // tokens going to exchanges
  largeTxCount: number; // transfers > $100k
  totalVolumeUsd: number; // total large-tx volume (used when no inflow/outflow split)
  hasExchangeSplit: boolean; // true if inflow/outflow available, false if volume-only (BTC/SOL/BNB)
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
  stablecoinSupply: ReducedStablecoinSupply[];
  sentiment: ReducedSentiment[];
  errors: string[]; // sources that failed (for metadata tracking)
}
