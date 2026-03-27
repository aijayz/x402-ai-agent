// src/lib/clusters/types.ts

/** Result from a single x402 service call within a cluster. */
export interface ServiceCallResult {
  serviceName: string;
  data: unknown;
  costMicroUsdc: number;
  paid: boolean;
  error?: string;
}

/** A service that is not currently configured/available. */
export interface UnavailableService {
  name: string;
  purpose: string;
  typicalCostUsdc: number;
}

/** Result from a cluster tool execution. */
export interface ClusterResult {
  summary: string;
  serviceCalls: ServiceCallResult[];
  totalCostMicroUsdc: number;
  unavailableServices?: UnavailableService[];
}

/** Markup rates in basis points. */
export const MARKUP_BPS: Record<string, number> = {
  default: 3000, // 30%
};

/** Minimum charge per cluster call in micro-USDC ($0.02). */
export const MIN_CLUSTER_CHARGE_MICRO = 20_000;

/** Apply markup to a micro-USDC amount with a minimum floor. Returns 0 if input is 0 (no charge on failure). */
export function applyMarkup(costMicroUsdc: number, markupBps = 3000): number {
  if (costMicroUsdc === 0) return 0;
  const withMarkup = Math.round(costMicroUsdc * (1 + markupBps / 10_000));
  return Math.max(withMarkup, MIN_CLUSTER_CHARGE_MICRO);
}

// ── Chain mapping for multi-chain service calls ─────────────────────

/** Canonical chain names used in cluster tool schemas (matches MCP tools). */
export type ClusterChain = "base" | "ethereum" | "arbitrum" | "optimism";

/** Map our canonical chain names → QuantumShield chain param (eth, base, arbitrum, polygon, bsc). */
export function toQSChain(chain: ClusterChain): string {
  const map: Record<ClusterChain, string> = { base: "base", ethereum: "eth", arbitrum: "arbitrum", optimism: "base" };
  return map[chain] ?? "base";
}

/** Map our canonical chain names → SLAMai blockchain param (ethereum, base). */
export function toSLAMaiChain(chain: ClusterChain): "ethereum" | "base" {
  return chain === "ethereum" ? "ethereum" : "base";
}

/** Whether Augur supports this chain (Base only). */
export function augurSupportsChain(chain: ClusterChain): boolean {
  return chain === "base";
}

/** Truncate service call data to fit within LLM context limits.
 *  Serializes each call's data and truncates if over maxChars. */
export function truncateServiceCalls(calls: ServiceCallResult[], maxCharsPerCall = 8_000): ServiceCallResult[] {
  return calls.map((call) => {
    const serialized = JSON.stringify(call.data);
    if (serialized.length <= maxCharsPerCall) return call;
    // Truncate: keep first portion + note
    const truncated = serialized.slice(0, maxCharsPerCall);
    return {
      ...call,
      data: {
        _truncated: true,
        _originalLength: serialized.length,
        partial: JSON.parse(truncated.slice(0, truncated.lastIndexOf(",")) + "}") as unknown,
      },
    };
  });
}

/** Safely truncate service calls — falls back to summary on parse error */
export function safelyTruncateServiceCalls(calls: ServiceCallResult[], maxCharsPerCall = 8_000): ServiceCallResult[] {
  return calls.map((call) => {
    try {
      const serialized = JSON.stringify(call.data);
      if (serialized.length <= maxCharsPerCall) return call;
      // For very large payloads, extract top-level keys and summarize
      const data = call.data as Record<string, unknown>;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const summary: Record<string, unknown> = { _truncated: true, _originalChars: serialized.length };
        for (const [key, val] of Object.entries(data)) {
          const valStr = JSON.stringify(val);
          if (valStr.length <= 2_000) {
            summary[key] = val;
          } else if (Array.isArray(val)) {
            summary[key] = `[${val.length} items, truncated]`;
            // Keep first 3 items as sample
            summary[`${key}_sample`] = val.slice(0, 3);
          } else {
            summary[key] = valStr.slice(0, 500) + "…";
          }
        }
        return { ...call, data: summary };
      }
      // Array or primitive — just slice
      if (Array.isArray(data)) {
        return { ...call, data: { _truncated: true, count: data.length, sample: data.slice(0, 5) } };
      }
      return { ...call, data: { _truncated: true, preview: serialized.slice(0, 2_000) } };
    } catch {
      return { ...call, data: { _truncated: true, error: "Data too large to serialize" } };
    }
  });
}

/** Log and alert on credit release failure (user overcharged). */
export async function handleReleaseFailure(
  clusterName: string,
  userWallet: string,
  unusedMicro: number,
  err: unknown,
): Promise<void> {
  console.error(`[${clusterName}] Failed to release credit reservation`, { userWallet, unusedMicro, error: err });
  // Lazy-import to avoid circular deps
  const { sendTelegramAlert } = await import("@/lib/telegram");
  await sendTelegramAlert(
    `*Credit Release Failed*\n\nUser overcharged — reservation not released.\n\nCluster: ${clusterName}\nWallet: \`${userWallet}\`\nUnreleased: $${(unusedMicro / 1_000_000).toFixed(4)}\nError: ${err instanceof Error ? err.message : String(err)}`
  ).catch(() => {});
}
