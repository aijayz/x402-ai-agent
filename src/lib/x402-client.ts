// src/lib/x402-client.ts
import { createPaymentHeader } from "x402/client";
import type { WalletClient } from "viem";

const X402_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 8000;

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

interface X402FetchOptions {
  walletClient: WalletClient;
  maxPaymentMicroUsdc?: number;
  timeoutMs?: number;
}

interface X402Result {
  data: unknown;
  paid: boolean;
  amountMicroUsdc: number;
  txHash?: string;
  paymentRequirements?: PaymentRequirements;
}

export function parse402Response(body: unknown): PaymentRequirements | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.x402Version !== "number") return null;
  if (!Array.isArray(obj.accepts) || obj.accepts.length === 0) return null;
  return obj.accepts[0] as PaymentRequirements;
}

export async function x402Fetch(
  url: string,
  init: RequestInit | undefined,
  options: X402FetchOptions,
): Promise<X402Result> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const res1 = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeout),
  });

  if (res1.status !== 402) {
    const data = await res1.json();
    return { data, paid: false, amountMicroUsdc: 0 };
  }

  const body402 = await res1.json();
  const requirements = parse402Response(body402);
  if (!requirements) {
    throw new Error(`x402: 402 response missing valid payment requirements from ${url}`);
  }

  const amountMicro = Number(requirements.maxAmountRequired);
  if (options.maxPaymentMicroUsdc && amountMicro > options.maxPaymentMicroUsdc) {
    throw new Error(
      `x402: service ${url} asks for ${amountMicro} micro-USDC, exceeds max ${options.maxPaymentMicroUsdc}`
    );
  }

  const paymentHeader = await createPaymentHeader(
    options.walletClient as any,
    X402_VERSION,
    requirements as any,
  );

  const res2 = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "X-PAYMENT": paymentHeader,
    },
    signal: AbortSignal.timeout(timeout),
  });

  if (!res2.ok) {
    const errorBody = await res2.text();
    throw new Error(
      `x402: service ${url} returned ${res2.status} after payment (${amountMicro} micro-USDC charged). Body: ${errorBody.slice(0, 200)}`
    );
  }

  const data = await res2.json();

  const txHash = res2.headers.get("x-payment-tx")
    ?? (typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).txHash as string | undefined
      : undefined);

  return {
    data,
    paid: true,
    amountMicroUsdc: amountMicro,
    txHash,
    paymentRequirements: requirements,
  };
}
