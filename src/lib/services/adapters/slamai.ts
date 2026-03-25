import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

const SLAMAI_BASE = env.SLAMAI_URL ?? "https://api.slamai.dev";

interface SLAMaiWalletInput {
  address: string;
}

/**
 * SLAMai wallet trades — profiles a wallet address with trade history,
 * mass tier (Whale/Dolphin/Fish), IQ score, and reputation grade.
 * $0.001/call via x402 on Base.
 */
export const slaMaiWalletAdapter: X402ServiceAdapter<SLAMaiWalletInput, unknown> = {
  name: "SLAMai",
  estimatedCostMicroUsdc: 1_000,
  async call(input: SLAMaiWalletInput, ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const result = await callWithPayment(
      `${SLAMAI_BASE}/wallet/trades?blockchain=base&wallet_address=${encodeURIComponent(input.address)}&num=10`,
      undefined,
      ctx,
      { maxPaymentMicroUsdc: 2_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "SLAMai" };
  },
};
