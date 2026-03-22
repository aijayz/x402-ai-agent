import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface GenvoxInput {
  topic: string;
}

export const genvoxAdapter: X402ServiceAdapter<GenvoxInput, unknown> = {
  name: "GenVox",
  estimatedCostMicroUsdc: 30_000,
  async call(input: GenvoxInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const url = process.env.GENVOX_URL;
    if (!url) throw new Error("GENVOX_URL not configured");
    const result = await callWithPayment(
      `${url}/sentiment?topic=${encodeURIComponent(input.topic)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 60_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "GenVox" };
  },
};
