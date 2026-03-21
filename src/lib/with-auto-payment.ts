/**
 * withAutoPayment — a hybrid payment wrapper for MCP clients.
 *
 * Behavior:
 *   - First call to a paid tool: the 402 error (with cost info) is returned
 *     to the AI so it can inform the user.
 *   - Second call to the same tool (or any subsequent call): the wrapper
 *     detects that we already know the payment requirements, auto-signs an
 *     EIP-3009 authorization via `createPaymentHeader`, retries the MCP call
 *     with `_meta["x402.payment"]`, and returns the result transparently.
 *   - Exposes `viewAccountBalance` for the AI to check the wallet balance.
 *   - Does NOT expose `generatePaymentAuthorization` (no longer needed).
 */

import { z } from "zod";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  type WalletClient,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { createPaymentHeader } from "x402/client";
import { tool } from "ai";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { MCPClient } from "@ai-sdk/mcp";

// x402 protocol version constant (matches x402-mcp/shared)
const X402_VERSION = 1;

// ── network helpers (mirrors x402-mcp/client) ──────────────────────────────

const networkToChain = {
  "base-sepolia": baseSepolia,
  base: base,
} as const;

type Network = keyof typeof networkToChain;

const networkToUsdcAddress: Record<Network, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// ── PaymentRequirements type (matches x402 spec) ───────────────────────────

interface PaymentRequirements {
  scheme: "exact";
  network: Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown>;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

// ── 402 error shape returned by the MCP paidTool handler ──────────────────

interface X402ErrorPayload {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
}

// ── options ────────────────────────────────────────────────────────────────

export interface AutoPaymentOptions {
  /** Viem Account (LocalAccount or similar) that will sign payments. */
  account: Parameters<typeof createWalletClient>[0]["account"];
  /** "base-sepolia" or "base" */
  network: Network;
  /** Maximum USDC (in micro-USDC, 6 decimals) per tool call. Default: 0.10 USDC */
  maxPaymentValue?: number;
}

// ── low-level helper: send tool/call with payment header in _meta ──────────

async function callToolWithPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, unknown>,
  paymentAuthorization: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any,
) {
  const request = client.request.bind(client);
  const assertCapability = client.assertCapability.bind(client);

  if (client.isClosed) {
    throw new Error("Attempted to send a request from a closed client");
  }
  assertCapability("tools/call");

  return request({
    request: {
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "x402.payment": paymentAuthorization,
        },
      },
    },
    resultSchema: CallToolResultSchema,
    options: {
      signal: options?.abortSignal,
    },
  });
}

// ── parse a tool result to see if it is a 402 error ───────────────────────

function parseX402Error(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): X402ErrorPayload | null {
  // The MCP server returns 402 as: { isError: true, content: [{ type:"text", text: JSON.stringify({x402Version, error, accepts}) }] }
  if (!result?.isError) return null;

  const textContent = Array.isArray(result.content)
    ? result.content.find(
        (c: { type: string; text?: string }) => c.type === "text",
      )
    : null;

  if (!textContent?.text) return null;

  try {
    const parsed = JSON.parse(textContent.text) as X402ErrorPayload;
    if (
      typeof parsed.x402Version === "number" &&
      Array.isArray(parsed.accepts) &&
      parsed.accepts.length > 0
    ) {
      return parsed;
    }
  } catch {
    // not JSON — not a 402 error
  }

  return null;
}

// ── main export ────────────────────────────────────────────────────────────

/**
 * Wraps an MCP client with auto-payment behaviour.
 *
 * First 402 → pass through to the AI (so it can show the user the cost).
 * Subsequent calls → auto-sign & retry transparently.
 */
export async function withAutoPayment(
  mcpClient: MCPClient,
  options: AutoPaymentOptions,
): Promise<MCPClient> {
  const walletClient: WalletClient = createWalletClient({
    account: options.account,
    transport: http(),
    chain: networkToChain[options.network],
  });

  const publicClient = createPublicClient({
    chain: networkToChain[options.network],
    transport: http(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = mcpClient as any;

  const maxPaymentValue = BigInt(options.maxPaymentValue ?? 100_000);

  // Per-request-lifetime cache: tool name → payment requirements received on
  // the first 402. Once populated the next call will auto-pay.
  const pendingPayments = new Map<string, PaymentRequirements>();

  // ── viewAccountBalance tool ──────────────────────────────────────────────

  const viewAccountBalanceTool = tool({
    description:
      "View the balance of the account in USDC. (USDC has 6 decimals, always divide by 10**6 to get the amount in USDC)",
    inputSchema: z.object({}),
    outputSchema: z.object({
      amount: z
        .string()
        .describe(
          "uint256 as string - balance of the account in USDC. (USDC has 6 decimals, always divide by 10**6 to get the amount in USDC)",
        ),
    }),
    execute: async () => {
      const address =
        typeof options.account === "object" && "address" in options.account
          ? options.account.address
          : (options.account as `0x${string}`);

      const result = await publicClient.readContract({
        address: networkToUsdcAddress[options.network],
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [address],
      });

      return { amount: (result as bigint).toString() };
    },
  });

  // ── wrap each MCP tool ───────────────────────────────────────────────────

  const originalToolsMethod = client.tools.bind(client);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedTools = async (toolOptions?: any) => {
    const originalTools = await originalToolsMethod(toolOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedToolsMap: Record<string, any> = {};

    for (const [name, originalTool] of Object.entries(originalTools)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = originalTool as any;

      wrappedToolsMap[name] = {
        ...t,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (args: Record<string, unknown>, execOptions?: any) => {
          const storedRequirements = pendingPayments.get(name);

          // ── auto-pay path ─────────────────────────────────────────────
          if (storedRequirements) {
            const maxAmountRequired = BigInt(
              storedRequirements.maxAmountRequired,
            );
            if (maxAmountRequired > maxPaymentValue) {
              throw new Error(
                "Payment requirements exceed user configured max payment value",
              );
            }

            const paymentHeader = await createPaymentHeader(
              // createPaymentHeader accepts WalletClient | LocalAccount
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              walletClient as any,
              X402_VERSION,
              storedRequirements,
            );

            // Clear after consuming so a failed settlement doesn't leave
            // stale requirements for the next call.
            pendingPayments.delete(name);

            return callToolWithPayment(
              client,
              name,
              args,
              paymentHeader,
              execOptions,
            );
          }

          // ── first call path ───────────────────────────────────────────
          if (!t.execute) {
            throw new Error(`Tool ${name} does not have an execute function`);
          }

          const result = await t.execute(args, execOptions);

          const x402Error = parseX402Error(result);
          if (x402Error) {
            // Store requirements so the next call auto-pays.
            const requirements = x402Error.accepts[0];
            if (requirements) {
              pendingPayments.set(name, requirements);
            }
          }

          // Return the 402 error to the AI on the first call so it can
          // inform the user about the cost before proceeding.
          return result;
        },
      };
    }

    return {
      ...wrappedToolsMap,
      viewAccountBalance: viewAccountBalanceTool,
    };
  };

  client.tools = wrappedTools;

  return client as MCPClient;
}
