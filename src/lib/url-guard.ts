import { URL } from "url";
import dns from "dns/promises";

/** IP ranges that must never be fetched by server-side tools (SSRF protection) */
const BLOCKED_RANGES = [
  /^127\./,              // loopback
  /^10\./,               // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC 1918
  /^192\.168\./,         // RFC 1918
  /^169\.254\./,         // link-local
  /^0\./,                // "this" network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGN (RFC 6598)
];

function isBlockedIp(ip: string): boolean {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  // Handle IPv4-mapped IPv6 (::ffff:127.0.0.1)
  const v4 = ip.replace(/^::ffff:/, "");
  return BLOCKED_RANGES.some((re) => re.test(v4));
}

/**
 * Validate a URL is safe to fetch server-side.
 * Returns null if safe, or an error message if blocked.
 */
export async function validateUrl(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Invalid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Blocked protocol: ${parsed.protocol}`;
  }

  // Block direct IP addresses in the hostname
  const hostname = parsed.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isBlockedIp(hostname)) {
    return "URL points to a private/reserved IP address";
  }

  // Resolve hostname and check all IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allAddrs = [...addresses, ...addresses6];

    if (allAddrs.length === 0) {
      return "Could not resolve hostname";
    }

    for (const addr of allAddrs) {
      if (isBlockedIp(addr)) {
        return "URL resolves to a private/reserved IP address";
      }
    }
  } catch {
    return "Could not resolve hostname";
  }

  return null;
}
