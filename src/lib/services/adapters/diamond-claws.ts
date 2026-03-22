import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface DiamondClawsInput {
  target: string;
}

// Maps to QuantumShield liquidity/check + pair/analysis endpoints
export const diamondClawsAdapter: X402ServiceAdapter<DiamondClawsInput, unknown> = {
  name: "DiamondClaws",
  estimatedCostMicroUsdc: 4_000, // $0.002 + $0.002
  async call(input: DiamondClawsInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const baseUrl = env.DIAMONDCLAWS_URL;
    if (!baseUrl) throw new Error("DIAMONDCLAWS_URL not configured");

    // Call both liquidity and pair analysis
    const [liquidity, pair] = await Promise.all([
      callWithPayment(
        `${baseUrl}/api/liquidity/check?address=${encodeURIComponent(input.target)}`,
        undefined,
        ctx,
        { maxPaymentMicroUsdc: 5_000 },
      ),
      callWithPayment(
        `${baseUrl}/api/pair/analysis?address=${encodeURIComponent(input.target)}`,
        undefined,
        ctx,
        { maxPaymentMicroUsdc: 5_000 },
      ),
    ]);

    const totalCost = liquidity.costMicroUsdc + pair.costMicroUsdc;
    return {
      data: { liquidity: liquidity.data, pair: pair.data },
      cost: totalCost,
      source: "QuantumShield (liquidity + pair analysis)",
    };
  },
};
