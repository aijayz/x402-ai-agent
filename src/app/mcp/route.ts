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
import { SUPPORTED_CHAINS, type ChainKey } from "@/lib/chains";
import { ReportStore } from "@/lib/reports/report-store";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import {
  executeDefiSafety, executeWhaleActivity, executeWalletPortfolio,
  executeSocialNarrative, executeTokenAlpha, executeMarketTrends,
} from "@/lib/api/research-handlers";
import {
  mapDefiSafetyResponse, mapWhaleActivityResponse, mapWalletPortfolioResponse,
  mapSocialNarrativeResponse, mapTokenAlphaResponse, mapMarketTrendsResponse,
  wrapResponse,
} from "@/lib/api/response-mapper";

const USDC_ADDRESS: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

const BASESCAN_HOST: Record<string, string> = {
  "base-sepolia": "api-sepolia.basescan.org",
  "base": "api.basescan.org",
};

// Etherscan-family API hosts (all share the same API format)
const EXPLORER_API_HOST: Record<string, string> = {
  base: "api.basescan.org",
  ethereum: "api.etherscan.io",
  arbitrum: "api.arbiscan.io",
  optimism: "api-optimistic.etherscan.io",
};

const EXPLORER_NAME: Record<string, string> = {
  base: "Basescan",
  ethereum: "Etherscan",
  arbitrum: "Arbiscan",
  optimism: "Optimistic Etherscan",
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
          "Get ETH balance, USDC balance, and transaction count for any EVM address. Supports Ethereum, Base, Arbitrum, and Optimism.",
          { price: TOOL_PRICES.get_wallet_profile },
          {
            address: z.string().describe("EVM wallet address (0x...)"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Which chain to query (default: base)"),
          },
          {},
          async (args) => {
            try {
              // For testnet, force base
              const chainKey = env.NETWORK === "base-sepolia" ? "base" : args.chain;
              const chainConfig = env.NETWORK === "base-sepolia"
                ? undefined  // use default getChain()
                : SUPPORTED_CHAINS[chainKey as ChainKey];

              const client = createPublicClient({
                chain: chainConfig?.viemChain ?? getChain(),
                transport: http(chainConfig?.rpcUrl),
              });
              const addr = args.address as `0x${string}`;
              const usdcAddr = chainConfig?.usdcAddress ?? USDC_ADDRESS[env.NETWORK];

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
                    chain: chainKey,
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
          "Fetch a verified smart contract's source code and provide AI analysis of its purpose, functions, and risks. Supports Ethereum, Base, Arbitrum, and Optimism.",
          { price: TOOL_PRICES.analyze_contract },
          {
            address: z.string().describe("Contract address (0x...)"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Which chain the contract is on (default: base)"),
          },
          {},
          async (args) => {
            try {
              // For testnet, force base
              const chain = env.NETWORK === "base-sepolia" ? "base" : args.chain;
              const host = env.NETWORK === "base-sepolia"
                ? BASESCAN_HOST[env.NETWORK]
                : EXPLORER_API_HOST[chain];
              const explorerName = env.NETWORK === "base-sepolia" ? "Basescan" : (EXPLORER_NAME[chain] ?? "Explorer");

              const res = await fetch(
                `https://${host}/api?module=contract&action=getsourcecode&address=${encodeURIComponent(args.address)}`
              );
              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Error: ${explorerName} API returned ${res.status}${res.status === 429 ? ". Rate limited — try again in a few seconds." : ""}` }],
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
                      chain,
                      isVerified: false,
                      contractName: null,
                      analysis: `Contract source code is not verified on ${explorerName}. Cannot analyze unverified contracts.`,
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
                    chain,
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
        // ── Free tools (no payment required) ─────────────────────────────

        server.tool(
          "get_daily_digest",
          "Get the latest daily intelligence digest — market overview, token analysis, and key signals. Free, no payment required.",
          {},
          async () => {
            try {
              const digest = await ReportStore.getLatestDigest();
              if (!digest) {
                return { content: [{ type: "text", text: "No digest available yet." }], isError: true };
              }
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    date: digest.digestDate ?? digest.createdAt.slice(0, 10),
                    title: digest.title,
                    content: digest.content,
                    tokenCount: Array.isArray(digest.markers) ? digest.markers.length : 0,
                  }),
                }],
              };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.tool(
          "list_tracked_tokens",
          "List all token symbols that have intelligence snapshots available. Free, no payment required.",
          {},
          async () => {
            try {
              const symbols = await TokenSnapshotStore.getAllSymbols();
              return { content: [{ type: "text", text: JSON.stringify({ tokens: symbols }) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.tool(
          "get_token_snapshot",
          "Get intelligence snapshot for a token — security score, whale flow, sentiment, and unlock schedule. Free, no payment required.",
          { symbol: z.string().describe("Token symbol (e.g. 'BTC', 'ETH', 'SOL')") },
          async (args) => {
            try {
              const snapshot = await TokenSnapshotStore.getBySymbol(args.symbol);
              if (!snapshot) {
                return { content: [{ type: "text", text: `No snapshot found for ${args.symbol.toUpperCase()}.` }], isError: true };
              }
              const d = snapshot.data;
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    symbol: snapshot.symbol,
                    name: d.name,
                    snapshotDate: snapshot.digestDate,
                    security: d.security ?? null,
                    whaleFlow: d.whaleFlow ? { netFlowUsd: d.whaleFlow.netFlowUsd, largeTxCount: d.whaleFlow.largeTxCount, totalVolumeUsd: d.whaleFlow.totalVolumeUsd } : null,
                    sentiment: d.sentiment ?? null,
                    unlocks: d.unlocks ?? null,
                  }),
                }],
              };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        // ── Paid cluster tools (x402 payment required) ──────────────────

        server.paidTool(
          "analyze_defi_safety",
          "Analyze a token or contract for rug pull risks, honeypot detection, and smart contract vulnerabilities. Returns security score, risk assessment, token unlocks, and on-chain data.",
          { price: TOOL_PRICES.analyze_defi_safety },
          {
            target: z.string().describe("Token address, contract address, or token name to analyze"),
            depth: z.enum(["quick", "full"]).default("quick").describe("'quick' = core scan (~$0.05), 'full' = all services (~$0.15)"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Chain the token is on"),
          },
          {},
          async (args) => {
            try {
              const result = await executeDefiSafety({ target: args.target, depth: args.depth, chain: args.chain });
              const data = mapDefiSafetyResponse(result);
              return { content: [{ type: "text", text: JSON.stringify(wrapResponse("defi-safety", result.summary, data, result.totalCostMicroUsdc)) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.paidTool(
          "track_whale_activity",
          "Track whale and smart money activity for a wallet or token address. Returns wallet risk, whale movements, recent trades, and on-chain flow data.",
          { price: TOOL_PRICES.track_whale_activity },
          {
            address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Wallet or token contract address (0x format)"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Chain to query"),
          },
          {},
          async (args) => {
            try {
              const result = await executeWhaleActivity({ address: args.address, chain: args.chain });
              const data = mapWhaleActivityResponse(result);
              return { content: [{ type: "text", text: JSON.stringify(wrapResponse("whale-activity", result.summary, data, result.totalCostMicroUsdc)) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.paidTool(
          "analyze_wallet_portfolio",
          "Deep-dive wallet analysis: risk profile, trade history, whale activity, and 30-day PnL.",
          { price: TOOL_PRICES.analyze_wallet_portfolio },
          {
            address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Wallet address (0x format)"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Chain to query"),
          },
          {},
          async (args) => {
            try {
              const result = await executeWalletPortfolio({ address: args.address, chain: args.chain });
              const data = mapWalletPortfolioResponse(result);
              return { content: [{ type: "text", text: JSON.stringify(wrapResponse("wallet-portfolio", result.summary, data, result.totalCostMicroUsdc)) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.paidTool(
          "analyze_social_narrative",
          "Analyze social narrative and market sentiment for a token or topic. Returns sentiment scores and risk assessment.",
          { price: TOOL_PRICES.analyze_social_narrative },
          {
            topic: z.string().describe("Topic to analyze, e.g. 'Solana sentiment', 'ETH merge'"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Chain context for on-chain services"),
          },
          {},
          async (args) => {
            try {
              const result = await executeSocialNarrative({ topic: args.topic, chain: args.chain });
              const data = mapSocialNarrativeResponse(result);
              return { content: [{ type: "text", text: JSON.stringify(wrapResponse("social-narrative", result.summary, data, result.totalCostMicroUsdc)) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.paidTool(
          "screen_token_alpha",
          "Screen a token for alpha signals: security score, unlock schedule, allocation breakdown, smart money moves, and token velocity.",
          { price: TOOL_PRICES.screen_token_alpha },
          {
            target: z.string().describe("Token name, symbol (e.g. 'AAVE'), or contract address (0x format)"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Chain the token is on"),
          },
          {},
          async (args) => {
            try {
              const result = await executeTokenAlpha({ target: args.target, chain: args.chain });
              const data = mapTokenAlphaResponse(result);
              return { content: [{ type: "text", text: JSON.stringify(wrapResponse("token-alpha", result.summary, data, result.totalCostMicroUsdc)) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );

        server.paidTool(
          "analyze_market_trends",
          "Analyze market trends — social sentiment plus optional contract audit, DEX volume, and stablecoin supply data.",
          { price: TOOL_PRICES.analyze_market_trends },
          {
            query: z.string().describe("Market trend query, e.g. 'trending narratives', 'ETH sentiment'"),
            contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Optional: contract address for audit"),
            chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base").describe("Chain for contract audit"),
          },
          {},
          async (args) => {
            try {
              const result = await executeMarketTrends({ query: args.query, contractAddress: args.contractAddress, chain: args.chain });
              const data = mapMarketTrendsResponse(result);
              return { content: [{ type: "text", text: JSON.stringify(wrapResponse("market-trends", result.summary, data, result.totalCostMicroUsdc)) }] };
            } catch (err) {
              return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }], isError: true };
            }
          },
        );
      },
      {
        serverInfo: {
          name: "x402-ai-agent",
          version: "0.2.0",
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