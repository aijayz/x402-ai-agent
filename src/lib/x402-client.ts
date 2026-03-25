// src/lib/x402-client.ts
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { WalletClient } from "viem";

const DEFAULT_TIMEOUT_MS = 8000;

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
}

// Cache wrapped fetch per wallet address to avoid re-creating on every call
const wrappedFetchCache = new Map<string, typeof fetch>();

/**
 * Some x402 v1 services (e.g. QuantumShield) nest EIP-712 domain params under
 * `extra.domain` instead of flat `extra`. The SDK v2.8.0 expects `extra.name`
 * and `extra.version` directly. This fetch wrapper normalizes 402 responses.
 */
function normalizing402Fetch(baseFetch: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await baseFetch(input, init);
    if (res.status !== 402) return res;

    const body = await res.text();
    let normalized = body;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed?.accepts)) {
        let changed = false;
        for (const accept of parsed.accepts) {
          if (accept.extra?.domain && !accept.extra.name) {
            accept.extra.name = accept.extra.domain.name;
            accept.extra.version = accept.extra.domain.version;
            changed = true;
          }
        }
        if (changed) normalized = JSON.stringify(parsed);
      }
    } catch { /* not JSON, pass through */ }

    return new Response(normalized, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }) as typeof fetch;
}

function getWrappedFetch(walletClient: WalletClient): typeof fetch {
  const address = walletClient.account?.address;
  if (!address) throw new Error("x402: wallet client has no account");

  const cached = wrappedFetchCache.get(address);
  if (cached) return cached;

  const signer = toClientEvmSigner(walletClient.account as any);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  const wrapped = wrapFetchWithPayment(normalizing402Fetch(fetch), client);
  wrappedFetchCache.set(address, wrapped as typeof fetch);
  return wrapped as typeof fetch;
}

export async function x402Fetch(
  url: string,
  init: RequestInit | undefined,
  options: X402FetchOptions,
): Promise<X402Result> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const paidFetch = getWrappedFetch(options.walletClient);

  const res = await paidFetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(
      `x402: service ${url} returned ${res.status}. Body: ${errorBody.slice(0, 200)}`
    );
  }

  const data = await res.json();

  // Check if payment was made by looking for payment response headers
  const txHash = res.headers.get("payment-response")
    ?? res.headers.get("x-payment-response")
    ?? res.headers.get("x-payment-tx")
    ?? (typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).txHash as string | undefined
      : undefined);

  // Determine cost from payment response header if available
  let amountMicroUsdc = 0;
  const paymentResponseHeader = res.headers.get("payment-response")
    ?? res.headers.get("x-payment-response");
  if (paymentResponseHeader) {
    try {
      const decoded = decodePaymentResponseHeader(paymentResponseHeader);
      if (decoded && typeof decoded === "object" && "transaction" in (decoded as any)) {
        // Payment was made
        amountMicroUsdc = options.maxPaymentMicroUsdc ?? 0;
      }
    } catch { /* no payment response to decode */ }
  }

  // If we got a tx hash, payment was made
  const paid = !!txHash || !!paymentResponseHeader;
  if (paid && amountMicroUsdc === 0) {
    amountMicroUsdc = options.maxPaymentMicroUsdc ?? 0;
  }

  return {
    data,
    paid,
    amountMicroUsdc,
    txHash,
  };
}

// --- Legacy parse402Response for eval script and debugging ---

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

function normalizeRequirements(raw: Record<string, unknown>): PaymentRequirements {
  return {
    scheme: (raw.scheme as string) ?? "exact",
    network: (raw.network as string) ?? "base",
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

function parsePaymentObject(obj: Record<string, unknown>): { requirements: PaymentRequirements; rawRequirements: Record<string, unknown>; version: number } | null {
  if (typeof obj.x402Version !== "number") return null;
  if (!Array.isArray(obj.accepts) || obj.accepts.length === 0) return null;
  const accepts = obj.accepts as Record<string, unknown>[];
  const baseEntry = accepts.find(a => {
    const n = a.network as string ?? "";
    return n === "base" || n === "eip155:8453";
  }) ?? accepts[0];
  return { requirements: normalizeRequirements(baseEntry), rawRequirements: baseEntry, version: obj.x402Version as number };
}

export function parse402Response(body: unknown, headerValue?: string | null): { requirements: PaymentRequirements; rawRequirements: Record<string, unknown>; version: number } | null {
  if (typeof body === "object" && body !== null) {
    const result = parsePaymentObject(body as Record<string, unknown>);
    if (result) return result;
  }
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
