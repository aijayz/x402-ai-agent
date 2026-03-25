import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

// QuantumShield API (quantumshield-api.vercel.app)
// 7 x402 endpoints for blockchain security intelligence ($0.001-$0.003 each)

interface QSInput {
  address: string;
}

function createQSAdapter(
  name: string,
  endpoint: string,
  costMicroUsdc: number,
): X402ServiceAdapter<QSInput, unknown> {
  return {
    name,
    estimatedCostMicroUsdc: costMicroUsdc,
    async call(input: QSInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
      const baseUrl = env.QUANTUM_SHIELD_URL;
      if (!baseUrl) throw new Error("QUANTUM_SHIELD_URL not configured");
      const result = await callWithPayment(
        `${baseUrl}${endpoint}?address=${encodeURIComponent(input.address)}`,
        undefined,
        ctx,
        { maxPaymentMicroUsdc: costMicroUsdc * 3 },
      );
      return { data: result.data, cost: result.costMicroUsdc, source: `QuantumShield (${name})` };
    },
  };
}

// Individual endpoint adapters — each cluster picks the ones it needs
export const qsTokenSecurity = createQSAdapter("QS Token Security", "/api/token/security", 2_000);
export const qsContractAudit = createQSAdapter("QS Contract Audit", "/api/contract/audit", 3_000);
export const qsWalletRisk = createQSAdapter("QS Wallet Risk", "/api/wallet/risk", 2_000);
