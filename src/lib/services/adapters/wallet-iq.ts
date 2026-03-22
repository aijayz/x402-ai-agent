import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface WalletIQInput {
  address: string;
}

export const walletIQAdapter: X402ServiceAdapter<WalletIQInput, unknown> = {
  name: "WalletIQ",
  estimatedCostMicroUsdc: 5_000,
  async call(input: WalletIQInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const url = env.WALLETIQ_URL;
    if (!url) throw new Error("WALLETIQ_URL not configured");
    const result = await callWithPayment(
      `${url}/v1/x402/profile/${encodeURIComponent(input.address)}`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 10_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "WalletIQ" };
  },
};
