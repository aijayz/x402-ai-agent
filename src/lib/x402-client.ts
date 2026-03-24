// src/lib/x402-client.ts
import { createPaymentHeader } from "x402/client";
import type { WalletClient } from "viem";

const DEFAULT_TIMEOUT_MS = 8000;

// EIP-155 chain ID → x402 v1 network name
const EIP155_NETWORK_MAP: Record<string, string> = {
  "eip155:8453": "base",
  "eip155:84532": "base-sepolia",
};

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

/**
 * Normalizes an x402 accepts entry to v1 PaymentRequirements format.
 * Handles v2 differences: `amount` field, `eip155:<chainId>` network strings,
 * and optional fields (`resource`, `description`, `mimeType`).
 */
function normalizeRequirements(raw: Record<string, unknown>): PaymentRequirements {
  const network = raw.network as string ?? "base";
  return {
    scheme: (raw.scheme as string) ?? "exact",
    network: EIP155_NETWORK_MAP[network] ?? network,
    maxAmountRequired: ((raw.maxAmountRequired ?? raw.amount) as string) ?? "0",
    resource: (raw.resource as string) ?? "",
    description: (raw.description as string) ?? "",
    mimeType: (raw.mimeType as string) ?? "application/json",
    payTo: raw.payTo as string,
    maxTimeoutSeconds: (raw.maxTimeoutSeconds as number) ?? 60,
    asset: raw.asset as string,
    extra: raw.extra as Record<string, unknown> | undefined,
  };
}

function parsePaymentObject(obj: Record<string, unknown>): { requirements: PaymentRequirements; version: number } | null {
  if (typeof obj.x402Version !== "number") return null;
  if (!Array.isArray(obj.accepts) || obj.accepts.length === 0) return null;
  // Prefer Base mainnet entry; fall back to first
  const accepts = obj.accepts as Record<string, unknown>[];
  const baseEntry = accepts.find(a => {
    const n = a.network as string ?? "";
    return n === "base" || n === "eip155:8453";
  }) ?? accepts[0];
  return { requirements: normalizeRequirements(baseEntry), version: obj.x402Version as number };
}

export function parse402Response(body: unknown, headerValue?: string | null): { requirements: PaymentRequirements; version: number } | null {
  // Try JSON body first (x402 v1 style)
  if (typeof body === "object" && body !== null) {
    const result = parsePaymentObject(body as Record<string, unknown>);
    if (result) return result;
  }
  // Fall back to Payment-Required header (x402 v2 style — base64-encoded JSON)
  if (headerValue) {
    try {
      const decoded = JSON.parse(Buffer.from(headerValue, "base64").toString("utf-8"));
      if (typeof decoded === "object" && decoded !== null) {
        return parsePaymentObject(decoded as Record<string, unknown>);
      }
    } catch { /* not valid base64 JSON */ }
  }
  return null;
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
  const paymentRequiredHeader = res1.headers.get("payment-required");
  const parsed = parse402Response(body402, paymentRequiredHeader);
  if (!parsed) {
    throw new Error(`x402: 402 response missing valid payment requirements from ${url}`);
  }

  const { requirements, version } = parsed;
  const amountMicro = Number(requirements.maxAmountRequired);
  if (options.maxPaymentMicroUsdc && amountMicro > options.maxPaymentMicroUsdc) {
    throw new Error(
      `x402: service ${url} asks for ${amountMicro} micro-USDC, exceeds max ${options.maxPaymentMicroUsdc}`
    );
  }

  const paymentHeader = await createPaymentHeader(
    options.walletClient as any,
    version,
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
