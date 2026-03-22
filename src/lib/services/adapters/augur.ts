import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface AugurInput {
  address: string;
}

// Maps to QuantumShield contract/audit endpoint
export const augurAdapter: X402ServiceAdapter<AugurInput, unknown> = {
  name: "Augur",
  estimatedCostMicroUsdc: 3_000, // $0.003
  async call(input: AugurInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const baseUrl = env.AUGUR_URL;
    if (!baseUrl) throw new Error("AUGUR_URL not configured");

    const result = await callWithPayment(
      `${baseUrl}/api/contract/audit?address=${encodeURIComponent(input.address)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 10_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "QuantumShield (contract audit)" };
  },
};
