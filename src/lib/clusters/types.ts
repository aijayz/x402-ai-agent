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

/** Apply markup to a micro-USDC amount. */
export function applyMarkup(costMicroUsdc: number, markupBps = 3000): number {
  return Math.round(costMicroUsdc * (1 + markupBps / 10_000));
}
