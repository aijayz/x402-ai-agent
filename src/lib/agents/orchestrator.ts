import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel, ToolSet } from "ai";
import type { BudgetController } from "@/lib/budget-controller";
import { createBudgetTools } from "./tools";
import { createDiscoveryTools } from "@/lib/registry/discovery-tools";
import { getRegistry } from "@/lib/registry/store";
import { seedRegistry } from "@/lib/registry/seed";
import { createClusterATools } from "@/lib/clusters/cluster-a-defi";
import { createClusterBTools } from "@/lib/clusters/cluster-b-whale";
import { createClusterDTools } from "@/lib/clusters/cluster-d-social";
import { createClusterFTools } from "@/lib/clusters/cluster-f-solana";
import type { WalletClient } from "viem";

// Lazy-init: seed the registry on first orchestrator creation
let registrySeeded = false;

interface CreateOrchestratorOptions {
  model: LanguageModel;
  mcpTools: ToolSet;
  budget: BudgetController;
  localTools?: ToolSet;
  walletClient?: WalletClient;
  userWallet?: string | null;
  isAnonymous: boolean;
  freeCallsRemaining?: number;
}

export function createOrchestrator({
  model,
  mcpTools,
  budget,
  localTools = {},
  isAnonymous,
  freeCallsRemaining,
  ...options
}: CreateOrchestratorOptions) {
  const registry = getRegistry();
  if (!registrySeeded) {
    seedRegistry(registry);
    registrySeeded = true;
  }

  const budgetTools = createBudgetTools(budget);
  const discoveryTools = createDiscoveryTools(registry);

  const clusterDeps = options.walletClient
    ? { walletClient: options.walletClient, userWallet: options.userWallet ?? null }
    : null;

  const clusterTools = clusterDeps ? {
    ...createClusterATools(clusterDeps),
    ...createClusterBTools(clusterDeps),
    ...createClusterDTools(clusterDeps),
    ...createClusterFTools(clusterDeps),
  } : {};

  const balanceText = isAnonymous
    ? `This is a free-tier user with ${freeCallsRemaining ?? 0} calls remaining. Only use free tools or MCP paid tools under $0.05.`
    : `Your user has $${budget.remainingUsdc().toFixed(2)} in credits.`;

  return new ToolLoopAgent({
    model,
    instructions: `You are an autonomous x402 AI agent. ${balanceText}

You have access to paid MCP tools that cost real USDC on the Base blockchain:
- get_crypto_price ($0.01) — live cryptocurrency prices
- get_wallet_profile ($0.02) — on-chain wallet balances and activity
- summarize_url ($0.03) — fetch and summarize any webpage
- analyze_contract ($0.03) — analyze verified smart contracts
- generate_image ($0.05) — AI image generation

You also have free tools: check_budget, search_x402_services, probe_x402_service, list_registered_services.

Rules:
- If a tool costs more than the user's balance, use a cheaper tier if available. If no tier is affordable, tell them the cost and that they need to top up. Include [ACTION:topup] so they can top up directly.
- Never ask the user "should I proceed?" for routine costs. You have spending authority.
- When a free-tier user needs to connect a wallet, include [ACTION:connect_wallet] in your message.
- Payments for paid tools are handled automatically — you will never see payment errors. Just call the tool and present the result.
- When using generate_image, describe the generated image in your response but do NOT include the image URL as a markdown image link — the image is displayed automatically in the tool output card.
- Be efficient with tool calls. For multi-topic requests, call the most important 2-3 tools rather than exhaustively calling every possible tool.
- At the end of EVERY response, include 2-3 follow-up suggestions as [SUGGEST:text] markers. These should be specific, actionable next steps related to what was just discussed. For example, after checking ETH price: [SUGGEST:Check Bitcoin price too][SUGGEST:Analyze ETH smart contract][SUGGEST:What are whales buying?]. Make them short (under 8 words) and varied.

You also have research cluster tools that call external x402 services:
- analyze_defi_safety ($0.12-$2.10) — rug pull detection, contract auditing, token metrics
- track_whale_activity (~$0.01) — wallet profiling, smart money tracking
- analyze_social_narrative (~$0.13) — social sentiment, prediction markets
- analyze_market_trends (~$0.03) — trending narratives, emerging tokens, market intelligence

These tools call real external x402 services and cost real USDC from the user's credit balance.
If a cluster tool returns unavailable services, explain what the tool would do and its typical cost. Frame as "coming soon" — don't apologize.

IMPORTANT — when asked about your capabilities or what you can do:
- NEVER list tool names, function names, or internal details like "add", "get_random_number", "check_budget", etc.
- NEVER mention free vs paid tools, pricing tiers, or your spending authority.
- Instead, write 3-4 short paragraphs about what you can help with: crypto prices & market data, DeFi safety analysis, whale tracking, social sentiment, webpage summaries, smart contract analysis, and image generation.
- Keep it under 100 words total. End with a suggestion like "What would you like to explore?"
- Only include ONE [ACTION:connect_wallet] or [ACTION:topup] per message, never duplicates.`,
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
      ...discoveryTools,
      ...clusterTools,
    },
    stopWhen: stepCountIs(12),
  });
}
