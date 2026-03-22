import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface RugMunchInput {
  target: string;
  depth?: "quick" | "full";
}

// Maps to QuantumShield token/security + honeypot/check endpoints
export const rugMunchAdapter: X402ServiceAdapter<RugMunchInput, unknown> = {
  name: "RugMunch",
  estimatedCostMicroUsdc: 3_000, // $0.002 + $0.001
  async call(input: RugMunchInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const baseUrl = env.RUGMUNCH_URL;
    if (!baseUrl) throw new Error("RUGMUNCH_URL not configured");

    // Call token security endpoint
    const security = await callWithPayment(
      `${baseUrl}/api/token/security?address=${encodeURIComponent(input.target)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 5_000 },
    );

    if (input.depth === "full") {
      // Also call honeypot check for full scan
      const honeypot = await callWithPayment(
        `${baseUrl}/api/honeypot/check?address=${encodeURIComponent(input.target)}`,
        undefined,
        ctx,
        { maxPaymentMicroUsdc: 5_000 },
      );
      const totalCost = security.costMicroUsdc + honeypot.costMicroUsdc;
      return {
        data: { security: security.data, honeypot: honeypot.data },
        cost: totalCost,
        source: "QuantumShield (token security + honeypot)",
      };
    }

    return { data: security.data, cost: security.costMicroUsdc, source: "QuantumShield (token security)" };
  },
};
