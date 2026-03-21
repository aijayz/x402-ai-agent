import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface RugMunchInput {
  target: string;
  depth?: "quick" | "full";
}

export const rugMunchAdapter: X402ServiceAdapter<RugMunchInput, unknown> = {
  name: "RugMunch",
  estimatedCostMicroUsdc: 50_000,
  async call(input: RugMunchInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const url = env.RUGMUNCH_URL;
    if (!url) throw new Error("RUGMUNCH_URL not configured");
    const result = await callWithPayment(
      `${url}/scan?target=${encodeURIComponent(input.target)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 2_000_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "RugMunch" };
  },
};
