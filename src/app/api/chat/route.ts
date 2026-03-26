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
import { getModel, probeModel, invalidateProbe } from "@/lib/ai-provider";
import { SessionStore } from "@/lib/credits/session-store";
import { CreditStore } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { checkAndIncrementIpFreeCalls, decrementIpFreeCalls } from "@/lib/rate-limit";
import { getVerifiedWallet } from "@/lib/wallet-auth";
import { sendTelegramAlert } from "@/lib/telegram";
import { TOOL_PRICES } from "@/lib/tool-prices";
import { applyMarkup } from "@/lib/clusters/types";

const SESSION_COOKIE_MAX_AGE = 1800; // 30 minutes

// Input validation schema
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.any()).optional(),
    content: z.string().optional(),
  }).passthrough()),
});

export const maxDuration = 120;

export const POST = async (request: Request) => {
  const cookieHeader = request.headers.get("cookie") || "";
  const existingSessionId = cookieHeader.match(/session_id=([^;]+)/)?.[1];
  const sessionId = existingSessionId || crypto.randomUUID();
  // Prefer signed cookie; fall back to header for transition period (remove fallback once all clients have cookie)
  const verifiedWallet = getVerifiedWallet(request);
  const headerWallet = request.headers.get("x-wallet-address");
  if (headerWallet && !verifiedWallet) {
    console.warn("[CHAT] Wallet from header without auth cookie — will be rejected after transition", { headerWallet });
  }
  const walletAddress = verifiedWallet || headerWallet;

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
      // Anonymous — session-based + IP-based, 2 free calls
      const ip = (request as Request & { headers: Headers }).headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? (request as Request & { headers: Headers }).headers.get("x-real-ip")
        ?? "unknown";

      const [session, ipCheck] = await Promise.all([
        SessionStore.getOrCreate(sessionId),
        checkAndIncrementIpFreeCalls(ip),
      ]);

      if (SessionStore.isFreeCallsExhausted(session.freeCallsUsed) || !ipCheck.allowed) {
        // If IP was incremented but session was exhausted (or vice versa), undo IP increment
        if (ipCheck.allowed) await decrementIpFreeCalls(ip);
        return new Response(
          JSON.stringify({
            error: "Free calls exhausted. Connect a wallet to continue.",
            code: "FREE_CALLS_EXHAUSTED",
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      // Increment session BEFORE constructing BudgetController.
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
  // Filter out messages with no content (e.g. assistant metadata-only messages from interrupted streams)
  const messages = validated.data.messages.filter(
    (msg) => (msg.parts?.length ?? 0) > 0 || (msg.content?.length ?? 0) > 0
  );

  if (messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "No messages with content provided" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Telegram alert on first message of a conversation
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 1) {
    const firstMsg = userMessages[0].content
      ?? userMessages[0].parts?.find((p: Record<string, unknown>) => p.type === "text")?.text
      ?? "(no text)";
    const preview = String(firstMsg).slice(0, 120);
    const who = walletAddress ? `\`${walletAddress}\`` : "Anonymous";
    sendTelegramAlert(
      `*New Chat*\n\nUser: ${who}\nQuery: ${preview}`
    ).catch(() => {});
  }

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

  // Model fallback chain: try each until one succeeds (deduplicated).
  const MODEL_FALLBACK_CHAIN = [...new Set([
    env.AI_MODEL,
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
  ])];

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
          for (const toolResult of toolResults ?? []) {
            const output = toolResult.output as Record<string, unknown> | undefined;
            const meta = output?._meta as Record<string, unknown> | undefined;
            const paymentResponse = meta?.["x402/payment-response"] as
              | { transaction?: string; amount?: number }
              | undefined;
            // Track cluster tool costs (credit deduction handled internally by cluster)
            const clusterOutput = output as { totalCostMicroUsdc?: number; serviceCalls?: unknown[] } | undefined;
            if (
              clusterOutput?.serviceCalls &&
              typeof clusterOutput.totalCostMicroUsdc === "number" &&
              clusterOutput.totalCostMicroUsdc > 0
            ) {
              const chargedMicro = applyMarkup(clusterOutput.totalCostMicroUsdc);
              turnSpendEvents.push({
                toolName: toolResult.toolName,
                amountUsdc: chargedMicro / 1_000_000,
              });
              if (walletAddress) {
                SpendEventStore.record({
                  walletAddress,
                  toolName: toolResult.toolName,
                  serviceCostMicroUsdc: clusterOutput.totalCostMicroUsdc,
                  chargedAmountMicroUsdc: chargedMicro,
                  markupBps: 3000,
                }).catch((err) => console.error("[SPEND] Failed to record cluster spend event", { walletAddress, tool: toolResult.toolName, err }));
              }
            }

            // Track Dune standalone tool costs (credit deduction handled internally)
            if (
              toolResult.toolName === "query_onchain_data" &&
              output &&
              !("error" in (output as Record<string, unknown>))
            ) {
              const duneChargedMicro = applyMarkup(50_000); // $0.05 base + 30% markup
              turnSpendEvents.push({
                toolName: toolResult.toolName,
                amountUsdc: duneChargedMicro / 1_000_000,
              });
              if (walletAddress) {
                SpendEventStore.record({
                  walletAddress,
                  toolName: toolResult.toolName,
                  serviceCostMicroUsdc: 50_000,
                  chargedAmountMicroUsdc: duneChargedMicro,
                  markupBps: 3000,
                }).catch((err) => console.error("[SPEND] Failed to record Dune spend event", { walletAddress, err }));
              }
            }

            if (paymentResponse?.transaction) {
              const serviceCostMicro = TOOL_PRICES[toolResult.toolName]
                ? Math.round(TOOL_PRICES[toolResult.toolName] * 1_000_000)
                : 0;
              const markupBps = 3000; // 30%
              const chargedMicro = Math.round(serviceCostMicro * 1.30);
              const txHash = paymentResponse.transaction;

              // Track in BudgetController (always — even for anon users)
              budget.recordSpend(chargedMicro, toolResult.toolName, txHash);
              turnSpendEvents.push({
                toolName: toolResult.toolName,
                amountUsdc: chargedMicro / 1_000_000,
              });

              if (walletAddress) {
                // 1. Record spend event FIRST (audit trail before deduction)
                try {
                  await SpendEventStore.record({
                    walletAddress,
                    toolName: toolResult.toolName,
                    serviceCostMicroUsdc: serviceCostMicro,
                    chargedAmountMicroUsdc: chargedMicro,
                    markupBps,
                    txHash,
                  });
                } catch (err) {
                  console.error("[PAYMENT] Failed to record spend event", { walletAddress, txHash, err });
                  await sendTelegramAlert(
                    `*Spend Event Failed*\n\nWallet: \`${walletAddress}\`\nTool: ${toolResult.toolName}\nAmount: $${(chargedMicro / 1_000_000).toFixed(4)}\nTx: \`${txHash}\`\nError: ${err instanceof Error ? err.message : String(err)}`
                  ).catch(() => {});
                }

                // 2. Deduct credits — try normal deduct, then force deduct on failure
                try {
                  const result = await CreditStore.deduct(walletAddress, chargedMicro);
                  if (!result.success) {
                    // Balance race condition — force deduct (allows negative balance)
                    console.warn("[PAYMENT] Normal deduct failed (insufficient balance race), force-deducting", {
                      walletAddress, chargedMicro, txHash,
                    });
                    const forced = await CreditStore.forceDeduct(walletAddress, chargedMicro);
                    if (!forced.success) {
                      // Account doesn't exist at all — should never happen
                      console.error("[PAYMENT] Force deduct failed — no account", { walletAddress, txHash });
                      await sendTelegramAlert(
                        `*Force Deduct Failed*\n\nNo account found.\n\nWallet: \`${walletAddress}\`\nTool: ${toolResult.toolName}\nAmount: $${(chargedMicro / 1_000_000).toFixed(4)}\nTx: \`${txHash}\``
                      ).catch(() => {});
                    } else {
                      await sendTelegramAlert(
                        `*Balance Race — Force Deducted*\n\nWallet: \`${walletAddress}\`\nTool: ${toolResult.toolName}\nAmount: $${(chargedMicro / 1_000_000).toFixed(4)}\nNew balance: $${((forced.newBalanceMicroUsdc ?? 0) / 1_000_000).toFixed(4)}\nTx: \`${txHash}\``
                      ).catch(() => {});
                    }
                  }
                } catch (err) {
                  // DB error — retry once
                  console.error("[PAYMENT] Deduct threw, retrying once", { walletAddress, txHash, err });
                  try {
                    await CreditStore.forceDeduct(walletAddress, chargedMicro);
                  } catch (retryErr) {
                    console.error("[PAYMENT] Retry deduct also failed — UNRECOVERED", { walletAddress, txHash, retryErr });
                    await sendTelegramAlert(
                      `*CRITICAL: Unrecovered Payment*\n\nOn-chain payment succeeded but credit deduction failed after retry.\n\nWallet: \`${walletAddress}\`\nTool: ${toolResult.toolName}\nAmount: $${(chargedMicro / 1_000_000).toFixed(4)}\nTx: \`${txHash}\`\nError: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
                    ).catch(() => {});
                  }
                }
              }
            }
          }
        },
        onError: (error) => {
          console.error(`[CHAT] Stream error with model ${modelId}:`, error);
          invalidateProbe(modelId);
          closeMcp();
          return error instanceof Error ? error.message : "An unexpected error occurred";
        },
        onFinish: async () => {
          await closeMcp();
        },
      });
    };

    // Probe models to find one that's reachable before committing to stream
    let selectedModel: string | undefined;
    let lastError: unknown;

    for (const modelId of MODEL_FALLBACK_CHAIN) {
      try {
        await probeModel(modelId);
        selectedModel = modelId;
        break;
      } catch (err) {
        console.warn(`Model ${modelId} probe failed, trying next...`, err);
        lastError = err;
      }
    }

    if (!selectedModel) {
      throw lastError ?? new Error("All models in fallback chain failed");
    }

    const response = await buildStreamResponse(selectedModel);

    // Add session cookie to response
    const headers = new Headers(response.headers);
    const secureSuffix = process.env.NODE_ENV === "production" ? "; Secure" : "";
    headers.set("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}${secureSuffix}`);

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
