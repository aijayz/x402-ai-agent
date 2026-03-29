/** x402 payment verification for REST API endpoints.
 *  Returns 402 with payment requirements when no payment header is present.
 *  Verifies and settles payment when header is provided. */

import { NextResponse } from "next/server";
import { processPriceToAtomicAmount } from "x402/shared";
import { exact } from "x402/schemes";
import { useFacilitator } from "x402/verify";
import { getOrCreateSellerAccount } from "@/lib/accounts";
import { env } from "@/lib/env";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const X402_VERSION = 1;

function getFacilitatorConfig() {
  if (env.NETWORK === "base") {
    return {
      url: "https://api.cdp.coinbase.com/platform/v2/x402" as `${string}://${string}`,
      createAuthHeaders: async () => {
        if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) {
          throw new Error("CDP_API_KEY_ID and CDP_API_KEY_SECRET required for mainnet");
        }
        const makeHeader = async (method: string, path: string) => {
          const jwt = await generateJwt({
            apiKeyId: env.CDP_API_KEY_ID!,
            apiKeySecret: env.CDP_API_KEY_SECRET!,
            requestMethod: method,
            requestHost: "api.cdp.coinbase.com",
            requestPath: path,
          });
          return { Authorization: `Bearer ${jwt}` };
        };
        return {
          verify: await makeHeader("POST", "/platform/v2/x402/verify"),
          settle: await makeHeader("POST", "/platform/v2/x402/settle"),
          supported: await makeHeader("GET", "/platform/v2/x402/supported"),
        };
      },
    };
  }
  return { url: "https://x402.org/facilitator" as `${string}://${string}` };
}

export interface PaywallResult {
  authorized: boolean;
  response?: NextResponse;
  settle?: () => Promise<void>;
}

/** Check x402 payment for a REST endpoint.
 *  Returns { authorized: true, settle } on valid payment.
 *  Returns { authorized: false, response } with 402 when payment is missing/invalid. */
export async function checkPayment(
  req: Request,
  price: number,
  resource: string,
  description: string,
): Promise<PaywallResult> {
  if (!price || price <= 0) {
    return { authorized: false, response: NextResponse.json({ error: "Invalid price configuration" }, { status: 500 }) };
  }

  const sellerAccount = await getOrCreateSellerAccount();
  const facilitator = getFacilitatorConfig();
  const { verify } = useFacilitator(facilitator);

  const atomicAmount = processPriceToAtomicAmount(price, env.NETWORK);
  if ("error" in atomicAmount) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Failed to process price" }, { status: 500 }),
    };
  }

  const { maxAmountRequired, asset } = atomicAmount;
  const paymentRequirements = {
    scheme: "exact" as const,
    network: env.NETWORK,
    maxAmountRequired,
    payTo: sellerAccount.address,
    asset: asset.address,
    maxTimeoutSeconds: 300,
    resource,
    mimeType: "application/json",
    description,
    extra: "eip712" in asset ? asset.eip712 : undefined,
  };

  // Check for payment header
  const paymentHeader = req.headers.get("x-payment") ?? req.headers.get("payment");
  if (!paymentHeader) {
    return {
      authorized: false,
      response: NextResponse.json(
        { x402Version: X402_VERSION, error: "Payment required", accepts: [paymentRequirements] },
        { status: 402 },
      ),
    };
  }

  // Decode and verify payment
  let decodedPayment;
  try {
    decodedPayment = exact.evm.decodePayment(paymentHeader);
    (decodedPayment as Record<string, unknown>).x402Version = X402_VERSION;
  } catch {
    return {
      authorized: false,
      response: NextResponse.json(
        { x402Version: X402_VERSION, error: "Invalid payment encoding", accepts: [paymentRequirements] },
        { status: 402 },
      ),
    };
  }

  const verification = await verify(decodedPayment, paymentRequirements);
  if (!verification.isValid) {
    return {
      authorized: false,
      response: NextResponse.json(
        { x402Version: X402_VERSION, error: verification.invalidReason, accepts: [paymentRequirements] },
        { status: 402 },
      ),
    };
  }

  // Payment verified — generate fresh JWT at settle time to avoid expiry during long cluster execution
  return {
    authorized: true,
    settle: async () => {
      try {
        const freshFacilitator = getFacilitatorConfig();
        const { settle: settleFn } = useFacilitator(freshFacilitator);
        await settleFn(decodedPayment, paymentRequirements);
      } catch (err) {
        console.error("[x402-paywall] Settlement failed:", err);
      }
    },
  };
}
