import { createPaidMcpHandler, PaymentMcpServer } from "x402-mcp/server";
import z from "zod";
import { getOrCreateSellerAccount } from "@/lib/accounts";
import { env } from "@/lib/env";

let handler: ReturnType<typeof createPaidMcpHandler> | null = null;

async function getHandler() {
  if (!handler) {
    const sellerAccount = await getOrCreateSellerAccount();

    handler = createPaidMcpHandler(
      (server: PaymentMcpServer) => {
        // Free tools (no payment required)
        server.tool(
          "get_random_number",
          "Get a random number between two numbers",
          {
            min: z.number().int(),
            max: z.number().int(),
          },
          async (args) => {
            const randomNumber =
              Math.floor(Math.random() * (args.max - args.min + 1)) + args.min;
            return {
              content: [{ type: "text", text: randomNumber.toString() }],
            };
          }
        );
        server.tool(
          "add",
          "Add two numbers",
          {
            a: z.number().int(),
            b: z.number().int(),
          },
          async (args) => {
            const result = args.a + args.b;
            return {
              content: [{ type: "text", text: result.toString() }],
            };
          }
        );
        server.tool(
          "hello-remote",
          "Receive a greeting",
          {
            name: z.string(),
          },
          async (args) => {
            return { content: [{ type: "text", text: `Hello ${args.name}` }] };
          }
        );

        // Paid tools (require USDC payment)
        server.paidTool(
          "premium_random",
          "Get a premium random number with special formatting",
          { price: 0.01 }, // $0.01 USDC
          {
            min: z.number().int(),
            max: z.number().int(),
          },
          {},
          async (args) => {
            const randomNumber =
              Math.floor(Math.random() * (args.max - args.min + 1)) + args.min;
            return {
              content: [
                {
                  type: "text",
                  text: `Premium Number: ${randomNumber}`,
                },
              ],
            };
          }
        );

        server.paidTool(
          "premium_analysis",
          "AI-powered analysis of a number",
          { price: 0.02 }, // $0.02 USDC
          {
            number: z.number(),
          },
          {},
          async (args) => {
            const num = args.number;
            const factors = [];
            for (let i = 1; i <= num; i++) {
              if (num % i === 0) factors.push(i);
            }
            return {
              content: [
                {
                  type: "text",
                  text: `Analysis of ${num}:\n- Is prime: ${factors.length === 2}\n- Factors: ${factors.join(", ")}\n- Square root: ${Math.sqrt(num).toFixed(4)}`,
                },
              ],
            };
          }
        );
      },
      {
        serverInfo: {
          name: "x402-ai-agent",
          version: "0.1.0",
        },
      },
      {
        recipient: sellerAccount.address,
        network: env.NETWORK,
        // Use default Coinbase facilitator
        facilitator: {
          url: "https://x402.org/facilitator",
        },
      }
    );
  }
  return handler;
}

export async function GET(req: Request) {
  const handler = await getHandler();
  return handler(req);
}

export async function POST(req: Request) {
  const handler = await getHandler();
  return handler(req);
}