import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface WalletIQInput {
  address: string;
}

// Maps to QuantumShield wallet/risk endpoint
export const walletIQAdapter: X402ServiceAdapter<WalletIQInput, unknown> = {
  name: "WalletIQ",
  estimatedCostMicroUsdc: 2_000, // $0.002
  async call(input: WalletIQInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const baseUrl = env.WALLETIQ_URL;
    if (!baseUrl) throw new Error("WALLETIQ_URL not configured");

    const result = await callWithPayment(
      `${baseUrl}/api/wallet/risk?address=${encodeURIComponent(input.address)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 5_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "QuantumShield (wallet risk)" };
  },
};
