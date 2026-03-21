import { createAgentUIStreamResponse } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMCPClient } from "@ai-sdk/mcp";
import { withAutoPayment } from "@/lib/with-auto-payment";
import z from "zod";
import { env } from "@/lib/env";
import { getOrCreatePurchaserAccount, getChain } from "@/lib/accounts";
import { createWalletClient, http } from "viem";
import { BudgetController } from "@/lib/budget-controller";
import { createOrchestrator } from "@/lib/agents/orchestrator";
import { getModel } from "@/lib/ai-provider";
import { SessionStore } from "@/lib/credits/session-store";
import { CreditStore } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";

const SESSION_COOKIE_MAX_AGE = 1800; // 30 minutes

// Input validation schema
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.any()).optional(),
    content: z.string().optional(),
  }).passthrough().refine((msg) => (msg.parts?.length ?? 0) > 0 || (msg.content?.length ?? 0) > 0, {
    message: "Message must have either parts or content",
  })),
});

export const maxDuration = 60;

export const POST = async (request: Request) => {
  const cookieHeader = request.headers.get("cookie") || "";
  const existingSessionId = cookieHeader.match(/session_id=([^;]+)/)?.[1];
  const sessionId = existingSessionId || crypto.randomUUID();
  const walletAddress = request.headers.get("x-wallet-address");

  let budget: BudgetController;
  let freeCallsRemaining: number | undefined;

  try {
    if (walletAddress) {
      // Wallet user — credit-based
      const account = await CreditStore.getOrCreate(walletAddress);
      budget = new BudgetController({
        mode: "credit",
        walletAddress,
        balanceMicroUsdc: account.balanceMicroUsdc,
      });
    } else {
      // Anonymous — session-based, 2 free calls
      const session = await SessionStore.getOrCreate(sessionId);
      if (SessionStore.isFreeCallsExhausted(session.freeCallsUsed)) {
        return new Response(
          JSON.stringify({
            error: "Free calls exhausted. Connect a wallet to continue.",
            code: "FREE_CALLS_EXHAUSTED",
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      // Increment in DB BEFORE constructing BudgetController.
      // Do NOT call budget.recordCall() later — the DB is the source of truth.
      await SessionStore.incrementCallCount(sessionId);
      freeCallsRemaining = SessionStore.MAX_FREE_CALLS - (session.freeCallsUsed + 1);
      budget = new BudgetController({
        sessionLimitUsdc: 0.50,
        maxCalls: 2,
        initialCallCount: session.freeCallsUsed + 1, // post-increment
      });
    }
  } catch (err) {
    console.error("[CHAT] Failed to initialize session/credits", err);
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable. Please try again." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  // Do NOT call budget.recordCall() here — DB handles anonymous counts,
  // credit mode has no call limit.

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const validated = ChatRequestSchema.safeParse(body);
  if (!validated.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: validated.error.errors }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { messages } = validated.data;

  // Get the purchaser account (wallet that pays for tools)
  const purchaserAccount = await getOrCreatePurchaserAccount();

  const houseWalletClient = createWalletClient({
    account: purchaserAccount,
    chain: getChain(),
    transport: http(),
  });

  // Create MCP client with payment support
  const baseMcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL("/mcp", env.URL)),
  });

  // Wrap with auto-payment capabilities:
  // first 402 → passes error to AI (shows cost); second call → auto-signs & retries
  const mcpClient = await withAutoPayment(baseMcpClient as any, {
    account: purchaserAccount,
    network: env.NETWORK,
    maxPaymentValue: 0.1 * 10 ** 6, // Max $0.10 USDC per tool call
  });

  // Guard against double-close (onFinish/onError + catch can both fire)
  let closed = false;
  const closeMcp = async () => {
    if (closed) return;
    closed = true;
    try {
      await mcpClient.close();
    } catch (e) {
      console.error("Error closing MCP client:", e);
    }
  };

  // Model fallback chain: try each until one succeeds
  const MODEL_FALLBACK_CHAIN = [
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
    "deepseek/deepseek-reasoner",
  ];

  try {
    const mcpTools = await mcpClient.tools();

    const turnSpendEvents: Array<{ toolName: string; amountUsdc: number }> = [];

    const buildStreamResponse = async (modelId: string) => {
      const agent = createOrchestrator({
        model: getModel(modelId),
        mcpTools,
        budget,
        localTools: {},
        walletClient: houseWalletClient,
        userWallet: walletAddress,
        isAnonymous: !walletAddress,
        freeCallsRemaining: walletAddress ? undefined : freeCallsRemaining,
      });

      return createAgentUIStreamResponse({
        agent,
        uiMessages: messages,
        sendSources: true,
        sendReasoning: true,
        messageMetadata: () => ({
          network: env.NETWORK,
          budgetRemaining: budget.remainingUsdc(),
          spendEvents: turnSpendEvents,
          freeCallsRemaining: walletAddress ? undefined : freeCallsRemaining,
        }),
        onStepFinish: async ({ toolResults }) => {
          // Known prices per tool (must match MCP server paidTool prices)
          const TOOL_PRICES: Record<string, number> = {
            get_crypto_price: 0.01,
            get_wallet_profile: 0.02,
            summarize_url: 0.03,
            analyze_contract: 0.03,
            generate_image: 0.05,
          };
          for (const toolResult of toolResults ?? []) {
            const output = toolResult.output as Record<string, unknown> | undefined;
            const meta = output?._meta as Record<string, unknown> | undefined;
            const paymentResponse = meta?.["x402.payment-response"] as
              | { transaction?: string; amount?: number }
              | undefined;
            if (paymentResponse?.transaction) {
              try {
                // All amounts in micro-USDC
                const serviceCostMicro = TOOL_PRICES[toolResult.toolName]
                  ? Math.round(TOOL_PRICES[toolResult.toolName] * 1_000_000)
                  : 0;
                const markupBps = 3000; // 30%
                const chargedMicro = Math.round(serviceCostMicro * 1.30);

                // Track in BudgetController (micro-USDC in both modes)
                budget.recordSpend(chargedMicro, toolResult.toolName, paymentResponse.transaction);

                turnSpendEvents.push({
                  toolName: toolResult.toolName,
                  amountUsdc: chargedMicro / 1_000_000,
                });

                if (walletAddress) {
                  // Atomic DB deduction for wallet users
                  const result = await CreditStore.deduct(walletAddress, chargedMicro);
                  if (!result.success) {
                    console.error("[PAYMENT] Credit deduction failed after on-chain payment", {
                      walletAddress,
                      toolName: toolResult.toolName,
                      txHash: paymentResponse.transaction,
                      chargedMicro,
                    });
                  }

                  await SpendEventStore.record({
                    walletAddress,
                    toolName: toolResult.toolName,
                    serviceCostMicroUsdc: serviceCostMicro,
                    chargedAmountMicroUsdc: chargedMicro,
                    markupBps,
                    txHash: paymentResponse.transaction,
                  });
                }
              } catch (err) {
                console.error("[PAYMENT] Failed to record spend event — on-chain payment may be untracked", {
                  walletAddress,
                  toolName: toolResult.toolName,
                  txHash: paymentResponse.transaction,
                  error: err,
                });
              }
            }
          }
        },
        onFinish: async () => {
          await closeMcp();
        },
      });
    };

    // Try each model in the fallback chain
    let response: globalThis.Response | undefined;
    let lastError: unknown;

    for (const modelId of MODEL_FALLBACK_CHAIN) {
      try {
        response = await buildStreamResponse(modelId);
        console.log(`Using model: ${modelId}`);
        break;
      } catch (err) {
        console.warn(`Model ${modelId} failed, trying next fallback...`, err);
        lastError = err;
      }
    }

    if (!response) {
      throw lastError ?? new Error("All models in fallback chain failed");
    }

    // Add session cookie to response
    const headers = new Headers(response.headers);
    headers.set("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}`);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    await closeMcp();
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
