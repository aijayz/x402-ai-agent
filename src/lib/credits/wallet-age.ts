/**
 * Detect obviously fabricated wallet addresses.
 * Catches sequential hex, repeated patterns, and all-same-char addresses.
 */
export function isSuspiciousAddress(address: string): boolean {
  const hex = address.slice(2).toLowerCase();

  // All same character (0x0000...0000, 0xffff...ffff)
  if (/^(.)\1{39}$/.test(hex)) return true;

  // Repeating short pattern (0x1234123412341234..., 0xabcabc...)
  for (const len of [2, 4, 5, 8, 10, 16, 20]) {
    const pattern = hex.slice(0, len);
    if (pattern.repeat(Math.ceil(40 / len)).slice(0, 40) === hex) return true;
  }

  // Sequential ascending hex (0x0123456789abcdef0123...)
  const sequential = "0123456789abcdef";
  for (let start = 0; start < sequential.length; start++) {
    let seq = "";
    for (let i = 0; i < 40; i++) {
      seq += sequential[(start + i) % sequential.length];
    }
    if (seq === hex) return true;
  }

  // Dead/burn addresses
  if (hex === "000000000000000000000000000000000000dead") return true;

  return false;
}

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
