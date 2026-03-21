import { x402Fetch } from "../x402-client";
import type { PaymentContext } from "./types";

interface CallOptions {
  maxPaymentMicroUsdc: number;
  timeoutMs?: number;
}

export async function callWithPayment<T = unknown>(
  url: string,
  init: RequestInit | undefined,
  ctx: PaymentContext,
  options: CallOptions,
): Promise<{ data: T; costMicroUsdc: number; paid: boolean }> {
  const result = await x402Fetch(url, init, {
    walletClient: ctx.walletClient,
    maxPaymentMicroUsdc: options.maxPaymentMicroUsdc,
    timeoutMs: options.timeoutMs,
  });
  return {
    data: result.data as T,
    costMicroUsdc: result.amountMicroUsdc,
    paid: result.paid,
  };
}
