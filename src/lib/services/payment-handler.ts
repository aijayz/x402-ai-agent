import { x402Fetch } from "../x402-client";
import type { PaymentContext } from "./types";

interface CallOptions {
  maxPaymentMicroUsdc: number;
  expectedCostMicroUsdc?: number;
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
  // x402 SDK handles payment silently — some services don't echo payment-response
  // headers, so x402Fetch may report amountMicroUsdc=0 even when payment occurred.
  // If the service returned data successfully, payment was made. Fall back to the
  // adapter's expected cost.
  const cost = result.amountMicroUsdc > 0
    ? result.amountMicroUsdc
    : (options.expectedCostMicroUsdc ?? 0);
  return {
    data: result.data as T,
    costMicroUsdc: cost,
    paid: result.paid || cost > 0,
  };
}
