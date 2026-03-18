import { createAgentUIStreamResponse, tool } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMCPClient } from "@ai-sdk/mcp";
import { withPayment } from "x402-mcp/client";
import z from "zod";
import { env } from "@/lib/env";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { BudgetController } from "@/lib/budget-controller";
import { createOrchestrator } from "@/lib/agents/orchestrator";
import { getModel } from "@/lib/ai-provider";

// In-memory session store (use Redis for production)
const sessionStore = new Map<string, { callCount: number; spent: number }>();

// Session timeout: 30 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function getOrCreateSession(sessionId: string) {
  const now = Date.now();
  const existing = sessionStore.get(sessionId);

  if (existing && now - (existing as any).lastActive < SESSION_TIMEOUT_MS) {
    (existing as any).lastActive = now;
    return existing;
  }

  // Create new session
  const session = { callCount: 0, spent: 0, lastActive: now };
  sessionStore.set(sessionId, session);

  // Clean up old sessions periodically
  if (sessionStore.size > 1000) {
    for (const [id, sess] of sessionStore) {
      if (now - (sess as any).lastActive > SESSION_TIMEOUT_MS) {
        sessionStore.delete(id);
      }
    }
  }

  return session;
}

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
  model: z.enum(["deepseek-chat", "deepseek-reasoner"]).default("deepseek-chat"),
});

export const maxDuration = 30;

export const POST = async (request: Request) => {
  // Get session ID from cookie or generate one
  const cookieHeader = request.headers.get("cookie") || "";
  const existingSessionId = cookieHeader.match(/session_id=([^;]+)/)?.[1];
  const sessionId = existingSessionId || crypto.randomUUID();

  // Get or create session data
  const session = getOrCreateSession(sessionId);

  // Per-session budget controller — $0.50 USDC limit, 5 DeepSeek calls max
  const budget = new BudgetController({
    sessionLimitUsdc: 0.50,
    maxCalls: 5,
    initialCallCount: session.callCount,
    initialSpent: session.spent,
  });

  // Check if call limit already exceeded
  const callCheck = budget.canMakeCall();
  if (!callCheck.allowed) {
    return new Response(
      JSON.stringify({ error: callCheck.reason }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }
  budget.recordCall();

  // Update session store with new call count
  session.callCount = budget.getCallCount();

  // Parse and validate request body
  const body = await request.json();
  const validated = ChatRequestSchema.safeParse(body);
  if (!validated.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: validated.error.errors }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { messages, model } = validated.data;

  // Get the purchaser account (wallet that pays for tools)
  const purchaserAccount = await getOrCreatePurchaserAccount();

  // Create MCP client with payment support
  const baseMcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL("/mcp", env.URL)),
  });

  // Wrap with payment capabilities
  const mcpClient = await withPayment(baseMcpClient as any, {
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

  try {
    const mcpTools = await mcpClient.tools();

    // Resolve frontend model selection to gateway model ID
    const modelId = model === "deepseek-reasoner"
      ? env.AI_REASONING_MODEL
      : env.AI_MODEL;

    const agent = createOrchestrator({
      model: getModel(modelId),
      mcpTools,
      budget,
      localTools: {
        "hello-local": tool({
          description: "Receive a greeting from the local server",
          inputSchema: z.object({ name: z.string() }),
          execute: async (args) => `Hello ${args.name} (from local tool)`,
        }),
      },
    });

    const response = await createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      sendSources: true,
      sendReasoning: true,
      messageMetadata: () => ({ network: env.NETWORK }),
      onStepFinish: async ({ toolResults }) => {
        for (const toolResult of toolResults ?? []) {
          const output = toolResult.output as Record<string, unknown> | undefined;
          const meta = output?._meta as Record<string, unknown> | undefined;
          const paymentResponse = meta?.["x402.payment-response"] as
            | { transaction?: string; amount?: number }
            | undefined;
          if (paymentResponse?.transaction) {
            // Amounts from x402 are in micro-USDC (10^6 units)
            const amountUsdc = (paymentResponse.amount ?? 0) / 1e6;
            budget.recordSpend(amountUsdc, toolResult.toolName, paymentResponse.transaction);
          }
        }
      },
      onFinish: async () => {
        await closeMcp();
      },
    });

    // Add session cookie to response
    const headers = new Headers(response.headers);
    headers.set("Set-Cookie", `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TIMEOUT_MS / 1000}`);

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
