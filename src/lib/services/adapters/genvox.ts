import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface GenvoxInput {
  topic: string;
}

// Maps to QuantumShield whale/activity endpoint as a market intelligence proxy
export const genvoxAdapter: X402ServiceAdapter<GenvoxInput, unknown> = {
  name: "GenVox",
  estimatedCostMicroUsdc: 2_000, // $0.002
  async call(input: GenvoxInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const url = env.GENVOX_URL;
    if (!url) throw new Error("GENVOX_URL not configured");

    const result = await callWithPayment(
      `${url}/api/whale/activity?address=${encodeURIComponent(input.topic)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 5_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "QuantumShield (whale activity)" };
  },
};
