/**
 * CoinGecko free-tier helpers.
 * Used to resolve contract addresses → token symbols before passing
 * to services that only accept names/symbols (e.g. Messari).
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// CoinGecko platform IDs for supported chains
const PLATFORM_IDS: Record<string, string> = {
  base: "base",
  "base-sepolia": "base",
};

/**
 * Resolve a contract address on a given network to its token symbol.
 * Returns null if not found or on any error (CoinGecko free tier may rate-limit).
 */
export async function resolveContractToSymbol(
  address: string,
  network: string,
): Promise<string | null> {
  const platformId = PLATFORM_IDS[network] ?? "base";
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${platformId}/contract/${encodeURIComponent(address.toLowerCase())}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { symbol?: string };
    return data.symbol?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * If `target` looks like a contract address, try to resolve it to a symbol.
 * Returns the resolved symbol, or the original target if resolution fails.
 */
export async function resolveTargetForMessari(
  target: string,
  network: string,
): Promise<string> {
  if (!/^0x[0-9a-fA-F]{40,}$/.test(target)) return target;
  const symbol = await resolveContractToSymbol(target, network);
  return symbol ?? target;
}
