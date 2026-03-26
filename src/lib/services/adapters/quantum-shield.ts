import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

// QuantumShield API (quantumshield-api.vercel.app)
// 7 x402 endpoints for blockchain security intelligence ($0.001-$0.003 each)
// Supports: base, eth, bsc, polygon, arbitrum (payments always on Base USDC)

interface QSInput {
  address: string;
  chain?: string; // "base" | "eth" | "bsc" | "polygon" | "arbitrum" (default: "base")
}

// Wallet Risk uses numeric chain IDs instead of named chains
const CHAIN_ID_MAP: Record<string, string> = {
  base: "8453",
  eth: "1",
  bsc: "56",
  polygon: "137",
  arbitrum: "42161",
};

function createQSAdapter(
  name: string,
  endpoint: string,
  costMicroUsdc: number,
  opts?: { useChainId?: boolean },
): X402ServiceAdapter<QSInput, unknown> {
  return {
    name,
    estimatedCostMicroUsdc: costMicroUsdc,
    async call(input: QSInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
      const baseUrl = env.QUANTUM_SHIELD_URL;
      if (!baseUrl) throw new Error("QUANTUM_SHIELD_URL not configured");
      const chain = input.chain ?? "base";
      const chainParam = opts?.useChainId ? (CHAIN_ID_MAP[chain] ?? "8453") : chain;
      const result = await callWithPayment(
        `${baseUrl}${endpoint}?address=${encodeURIComponent(input.address)}&chain=${chainParam}`,
        undefined,
        ctx,
        { maxPaymentMicroUsdc: costMicroUsdc * 3, expectedCostMicroUsdc: costMicroUsdc },
      );
      return { data: result.data, cost: result.costMicroUsdc, source: `QuantumShield (${name})` };
    },
  };
}

// Individual endpoint adapters — each cluster picks the ones it needs
export const qsTokenSecurity = createQSAdapter("QS Token Security", "/api/token/security", 2_000);
export const qsContractAudit = createQSAdapter("QS Contract Audit", "/api/contract/audit", 3_000);
export const qsWalletRisk = createQSAdapter("QS Wallet Risk", "/api/wallet/risk", 2_000, { useChainId: true });
export const qsWhaleActivity = createQSAdapter("QS Whale Activity", "/api/whale/activity", 2_000);
