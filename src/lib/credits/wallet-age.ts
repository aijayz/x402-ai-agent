const EXPLORER_APIS: Record<string, string> = {
  base: "https://api.basescan.org/api",
  "base-sepolia": "https://api-sepolia.basescan.org/api",
};

/**
 * Get wallet age in days by querying the earliest transaction from Basescan.
 * Returns null if the wallet has no transactions or the API fails.
 * Uses the free tier (no API key needed, 5 req/sec).
 */
export async function getWalletAgeDays(
  address: string,
  network: "base" | "base-sepolia" = "base",
): Promise<number | null> {
  const baseUrl = EXPLORER_APIS[network];
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "txlist");
    url.searchParams.set("address", address);
    url.searchParams.set("startblock", "0");
    url.searchParams.set("endblock", "99999999");
    url.searchParams.set("page", "1");
    url.searchParams.set("offset", "1");
    url.searchParams.set("sort", "asc");

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "1" || !data.result?.length) return null;

    const firstTxTimestamp = Number(data.result[0].timeStamp);
    if (!firstTxTimestamp) return null;

    const ageMs = Date.now() - firstTxTimestamp * 1000;
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
