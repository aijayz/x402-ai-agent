import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface AugurInput {
  address: string;
}

export const augurAdapter: X402ServiceAdapter<AugurInput, unknown> = {
  name: "Augur",
  estimatedCostMicroUsdc: 100_000,
  async call(input: AugurInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const url = env.AUGUR_URL;
    if (!url) throw new Error("AUGUR_URL not configured");
    const result = await callWithPayment(
      `${url}/analyze?address=${encodeURIComponent(input.address)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 200_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "Augur" };
  },
};
