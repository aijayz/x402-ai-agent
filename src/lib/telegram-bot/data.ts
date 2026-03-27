import { env } from "@/lib/env";
import { TokenSnapshotStore, type TokenSnapshotData } from "@/lib/token-pages/store";
import { ReportStore } from "@/lib/reports/report-store";

const COINGECKO_BASE = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";

/** Get live price from CoinGecko (with fallback to token snapshot) */
export async function getPrice(symbol: string): Promise<{
  symbol: string; name: string; price: number; change24h: number; marketCap: number;
} | null> {
  // Try token snapshot first (cached, free)
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase()).catch(() => null);
  if (snap) {
    return {
      symbol: snap.symbol,
      name: snap.data.name,
      price: snap.data.price,
      change24h: snap.data.change24h,
      marketCap: snap.data.marketCap,
    };
  }

  // Fallback: CoinGecko simple price
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const key = Object.keys(data)[0];
    if (!key) return null;
    const coin = data[key];
    return {
      symbol: symbol.toUpperCase(),
      name: key,
      price: coin.usd ?? 0,
      change24h: coin.usd_24h_change ?? 0,
      marketCap: coin.usd_market_cap ?? 0,
    };
  } catch {
    return null;
  }
}

/** Get whale flow data from token snapshot */
export async function getWhaleData(symbol: string): Promise<TokenSnapshotData["whaleFlow"]> {
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase()).catch(() => null);
  return snap?.data.whaleFlow ?? null;
}

/** Get security score from QuantumShield (subsidized, ~$0.001) */
export async function getSecurity(symbol: string): Promise<{
  score: number; details?: string;
} | null> {
  const qsUrl = env.QUANTUM_SHIELD_URL ?? "https://quantumshield-api.vercel.app";
  try {
    const res = await fetch(
      `${qsUrl}/api/token/security?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      score: Number(data.score ?? data.securityScore ?? 0),
      details: data.summary ?? data.details ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Get today's alpha (top mover from latest digest) */
export async function getAlpha(): Promise<string | null> {
  try {
    const digest = await ReportStore.getLatestDigest();
    if (!digest) return null;
    const verdictMatch = digest.content.match(/\[VERDICT:([^|]+)\|(\w+)]/);
    return verdictMatch ? verdictMatch[1].trim() : digest.title;
  } catch {
    return null;
  }
}
