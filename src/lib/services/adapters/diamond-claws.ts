import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface DiamondClawsInput {
  target: string;
}

export const diamondClawsAdapter: X402ServiceAdapter<DiamondClawsInput, unknown> = {
  name: "DiamondClaws",
  estimatedCostMicroUsdc: 1_000,
  async call(input: DiamondClawsInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const url = env.DIAMONDCLAWS_URL;
    if (!url) throw new Error("DIAMONDCLAWS_URL not configured");
    const result = await callWithPayment(
      `${url}/score?target=${encodeURIComponent(input.target)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 2_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "DiamondClaws" };
  },
};
