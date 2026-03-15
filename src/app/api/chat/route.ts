import { stepCountIs, streamText } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMCPClient } from "@ai-sdk/mcp";
import { withPayment } from "x402-mcp/client";
import { tool } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import z from "zod";
import { env } from "@/lib/env";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";

// Input validation schema
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.any()).optional(),
    content: z.string().optional(),
  }).refine((msg) => (msg.parts?.length ?? 0) > 0 || (msg.content?.length ?? 0) > 0, {
    message: "Message must have either parts or content",
  })),
  model: z.enum(["deepseek-chat", "deepseek-reasoner"]).default("deepseek-chat"),
});

export const maxDuration = 30;

export const POST = async (request: Request) => {
  try {
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

    const tools = await mcpClient.tools();

    // Map frontend model values to DeepSeek models
    const deepseekModel = model === "deepseek-reasoner"
      ? "deepseek-reasoner"
      : "deepseek-chat";

    // Convert UIMessages to CoreMessages
    // AI SDK v6 UIMessage has parts array, but frontend might send content string
    const coreMessages = messages.map((msg) => {
      // Handle both old format (content) and new format (parts)
      if ('parts' in msg && msg.parts) {
        // New format with parts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textParts = msg.parts.filter((p: any) => p.type === 'text');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = textParts.map((p: any) => p.text).join('\n');
        return { role: msg.role, content: text };
      } else if ('content' in msg) {
        // Old format with content string
        return { role: msg.role, content: msg.content as string };
      }
      return { role: msg.role, content: '' };
    });

    const result = streamText({
      model: deepseek(deepseekModel) as any,
      tools: {
        ...tools,
        // Local free tool
        "hello-local": tool({
          description: "Receive a greeting from the local server",
          inputSchema: z.object({
            name: z.string(),
          }),
          execute: async (args) => {
            return `Hello ${args.name} (from local tool)`;
          },
        }),
      },
      toolChoice: 'auto',
      messages: coreMessages,
      stopWhen: stepCountIs(5),
      onFinish: async () => {
        await mcpClient.close();
      },
      system: `You are DeepSeek, a helpful AI assistant. You can:

1. **Answer general questions** - Use your knowledge to help with coding, writing, analysis, math, science, and any other topics
2. **Have conversations** - Chat naturally with users about anything
3. **Use tools when helpful** - You have access to special tools:
   - \`add\` - Add two numbers
   - \`get_random_number\` - Generate a random number (free)
   - \`hello-local\` - Receive a greeting (free, local)
   - \`premium_random\` - Premium random number ($0.01 USDC)
   - \`premium_analysis\` - Number analysis ($0.02 USDC)

For paid tools, you'll handle the crypto payment automatically using x402 protocol.

Be helpful and natural. Use tools when they're genuinely useful, but don't force them. Most questions can be answered directly with your knowledge.`,
    });

    return result.toUIMessageStreamResponse({
      sendSources: true,
      sendReasoning: true,
      messageMetadata: () => ({ network: env.NETWORK }),
    });
  } catch (error) {
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