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
