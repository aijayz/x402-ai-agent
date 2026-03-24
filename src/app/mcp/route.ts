import { createPaidMcpHandler, PaymentMcpServer } from "x402-mcp/server";
import z from "zod";
import { getOrCreateSellerAccount } from "@/lib/accounts";
import { env } from "@/lib/env";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { getChain } from "@/lib/accounts";
import { generateText } from "ai";
import { getModel } from "@/lib/ai-provider";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { TOOL_PRICES } from "@/lib/tool-prices";
import { validateUrl } from "@/lib/url-guard";

const USDC_ADDRESS: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

const BASESCAN_HOST: Record<string, string> = {
  "base-sepolia": "api-sepolia.basescan.org",
  "base": "api.basescan.org",
};

let handler: ReturnType<typeof createPaidMcpHandler> | null = null;

async function getHandler() {
  if (!handler) {
    const sellerAccount = await getOrCreateSellerAccount();

    handler = createPaidMcpHandler(
      (server: PaymentMcpServer) => {
        const coingeckoBase = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";

        // Resolve a token name/symbol to a CoinGecko ID via search API
        async function resolveTokenId(input: string): Promise<string | null> {
          try {
            const res = await fetch(
              `${coingeckoBase}/search?query=${encodeURIComponent(input)}`
            );
            if (!res.ok) return null;
            const data = await res.json();
            const coins = data.coins as Array<{ id: string; symbol: string; name: string }> | undefined;
            if (!coins?.length) return null;
            // Exact symbol match (case-insensitive) takes priority
            const bySymbol = coins.find(c => c.symbol.toLowerCase() === input.toLowerCase());
            if (bySymbol) return bySymbol.id;
            // Otherwise return the top search result
            return coins[0].id;
          } catch {
            return null;
          }
        }

        // Paid tools (require USDC payment)
        server.paidTool(
          "get_crypto_price",
          "Get live cryptocurrency price, 24h change, and market cap for any token. Accepts token symbols (BTC, ETH, CRO), names (bitcoin, cronos), or CoinGecko IDs.",
          { price: TOOL_PRICES.get_crypto_price },
          {
            token: z.string().describe("Token symbol (e.g. 'BTC', 'ETH', 'CRO') or name (e.g. 'bitcoin', 'ethereum', 'cronos')"),
          },
          {},
          async (args) => {
            try {
              // First try the input directly as a CoinGecko ID
              let tokenId = args.token.toLowerCase();
              let res = await fetch(
                `${coingeckoBase}/coins/${encodeURIComponent(tokenId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
              );
              // If not found, resolve via search API
              if (res.status === 404) {
                const resolved = await resolveTokenId(args.token);
                if (!resolved) {
                  return {
                    content: [{ type: "text", text: `I couldn't find a token matching "${args.token}".` }],
                    isError: true,
                  };
                }
                tokenId = resolved;
                res = await fetch(
                  `${coingeckoBase}/coins/${encodeURIComponent(tokenId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
                );
              }
              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Price lookup temporarily unavailable.${res.status === 429 ? " Rate limited — try again in a moment." : ""}` }],
                  isError: true,
                };
              }
              const data = await res.json();
              const md = data.market_data;
              if (!md) {
                return {
                  content: [{ type: "text", text: `No market data available for "${args.token}".` }],
                  isError: true,
                };
              }
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    token: tokenId,
                    symbol: data.symbol?.toUpperCase(),
                    name: data.name,
                    priceUsd: md.current_price?.usd,
                    change24h: md.price_change_percentage_24h,
                    marketCap: md.market_cap?.usd,
                  }),
                }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error fetching price: ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        );

        server.paidTool(
          "get_wallet_profile",
          "Get ETH balance, USDC balance, and transaction count for any EVM address on Base",
          { price: TOOL_PRICES.get_wallet_profile },
          {
            address: z.string().describe("EVM wallet address (0x...)"),
          },
          {},
          async (args) => {
            try {
              const client = createPublicClient({
                chain: getChain(),
                transport: http(),
              });
              const addr = args.address as `0x${string}`;
              const usdcAddr = USDC_ADDRESS[env.NETWORK];

              const [ethBalance, usdcBalance, txCount] = await Promise.all([
                client.getBalance({ address: addr }),
                client.readContract({
                  address: usdcAddr,
                  abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
                  functionName: "balanceOf",
                  args: [addr],
                }),
                client.getTransactionCount({ address: addr }),
              ]);

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    address: args.address,
                    ethBalance: formatEther(ethBalance),
                    usdcBalance: formatUnits(usdcBalance, 6),
                    transactionCount: txCount,
                    network: env.NETWORK,
                  }),
                }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error querying wallet: ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        );

        server.paidTool(
          "summarize_url",
          "Fetch a webpage and return an AI-generated summary of its content",
          { price: TOOL_PRICES.summarize_url },
          {
            url: z.string().url().describe("URL to fetch and summarize"),
          },
          {},
          async (args) => {
            try {
              // SSRF protection: block private/reserved IPs
              const urlError = await validateUrl(args.url);
              if (urlError) {
                return {
                  content: [{ type: "text", text: `Blocked: ${urlError}` }],
                  isError: true,
                };
              }

              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 10000);
              const res = await fetch(args.url, { signal: controller.signal });
              clearTimeout(timeout);

              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Error: Failed to fetch URL (HTTP ${res.status})` }],
                  isError: true,
                };
              }

              const contentType = res.headers.get("content-type") || "";
              if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
                return {
                  content: [{ type: "text", text: `Unsupported content type: ${contentType}. Only HTML and plain text pages are supported.` }],
                  isError: true,
                };
              }

              const html = await res.text();
              const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
              const wordCount = text.split(/\s+/).length;

              const { text: summary } = await generateText({
                model: getModel(env.AI_MODEL),
                prompt: `Summarize the following webpage content in 2-3 concise paragraphs:\n\n${text}`,
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ url: args.url, summary, wordCount }),
                }],
              };
            } catch (err) {
              const msg = err instanceof Error && err.name === "AbortError"
                ? "Request timed out after 10 seconds"
                : err instanceof Error ? err.message : "Unknown error";
              return {
                content: [{ type: "text", text: `Error summarizing URL: ${msg}` }],
                isError: true,
              };
            }
          }
        );

        server.paidTool(
          "analyze_contract",
          "Fetch a verified smart contract's source code from Basescan and provide AI analysis of its purpose, functions, and risks",
          { price: TOOL_PRICES.analyze_contract },
          {
            address: z.string().describe("Contract address on Base (0x...)"),
          },
          {},
          async (args) => {
            try {
              const host = BASESCAN_HOST[env.NETWORK];
              const res = await fetch(
                `https://${host}/api?module=contract&action=getsourcecode&address=${encodeURIComponent(args.address)}`
              );
              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Error: Basescan API returned ${res.status}${res.status === 429 ? ". Rate limited — try again in a few seconds." : ""}` }],
                  isError: true,
                };
              }

              const data = await res.json();
              const result = data.result?.[0];

              if (!result || !result.SourceCode || result.ABI === "Contract source code not verified") {
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      address: args.address,
                      isVerified: false,
                      contractName: null,
                      analysis: "Contract source code is not verified on Basescan. Cannot analyze unverified contracts.",
                    }),
                  }],
                };
              }

              const source = result.SourceCode.slice(0, 4000);

              const { text: analysis } = await generateText({
                model: getModel(env.AI_MODEL),
                prompt: `Analyze this Solidity smart contract. Explain: 1) What it does, 2) Key functions, 3) Potential risks or concerns.\n\nContract: ${result.ContractName}\n\n${source}`,
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    address: args.address,
                    contractName: result.ContractName,
                    isVerified: true,
                    analysis,
                  }),
                }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error analyzing contract: ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        );

        server.paidTool(
          "generate_image",
          "Generate an AI image from a text prompt using Pollinations.ai",
          { price: TOOL_PRICES.generate_image },
          {
            prompt: z.string().describe("Text description of the image to generate"),
            width: z.number().int().min(256).max(1024).default(512).describe("Image width in pixels"),
            height: z.number().int().min(256).max(1024).default(512).describe("Image height in pixels"),
          },
          {},
          async (args) => {
            try {
              const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}?width=${args.width}&height=${args.height}&nologo=true&seed=${Date.now()}`;

              // Pre-fetch the image to ensure it generates successfully
              let res: globalThis.Response | null = null;
              for (let attempt = 0; attempt < 2; attempt++) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                res = await fetch(imageUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) break;
                // Retry once on 429/500
                if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
                  await new Promise(r => setTimeout(r, 2000));
                  continue;
                }
                break;
              }

              if (!res || !res.ok) {
                return {
                  content: [{ type: "text", text: `Error: Image generation failed (HTTP ${res?.status ?? "timeout"}). Pollinations.ai may be rate-limited — try again in a moment.` }],
                  isError: true,
                };
              }

              const buffer = await res.arrayBuffer();
              const base64 = Buffer.from(buffer).toString("base64");
              const contentType = res.headers.get("content-type") || "image/jpeg";
              const dataUrl = `data:${contentType};base64,${base64}`;

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    prompt: args.prompt,
                    imageUrl: dataUrl,
                    width: args.width,
                    height: args.height,
                  }),
                }],
              };
            } catch (err) {
              const msg = err instanceof Error && err.name === "AbortError"
                ? "Image generation timed out after 30 seconds"
                : err instanceof Error ? err.message : "Unknown error";
              return {
                content: [{ type: "text", text: `Error generating image: ${msg}` }],
                isError: true,
              };
            }
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
        facilitator: env.NETWORK === "base"
          ? {
              url: "https://api.cdp.coinbase.com/platform/v2/x402",
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
                };
              },
            }
          : {
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