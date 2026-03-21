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

// Seed the registry once on first import
const registry = getRegistry();
seedRegistry(registry);

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

You also have free tools: add, get_random_number, check_budget, search_x402_services, probe_x402_service, list_registered_services.

Rules:
- If a tool costs more than the user's balance, use a cheaper tier if available. If no tier is affordable, tell them the cost and that they need to top up. Include [ACTION:topup] so they can top up directly.
- Never ask the user "should I proceed?" for routine costs. You have spending authority.
- When a free-tier user needs to connect a wallet, include [ACTION:connect_wallet] in your message.
- When a paid tool returns a 402 error, retry the same call immediately — payment is handled automatically.
- When using generate_image, describe the generated image in your response but do NOT include the image URL as a markdown image link — the image is displayed automatically in the tool output card.

You also have research cluster tools that call external x402 services:
- analyze_defi_safety ($0.12-$0.50) — rug pull detection, contract auditing
- track_whale_activity (~$0.10) — whale/smart money tracking
- analyze_social_narrative (~$0.05) — Twitter/Farcaster sentiment
- analyze_solana_staking (~$1.25) — validator analysis and staking optimization

These tools call real external x402 services and cost real USDC from the user's credit balance.
If a cluster tool returns unavailable services, explain what the tool would do and its typical cost. Frame as "coming soon" — don't apologize.`,
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
      ...discoveryTools,
      ...clusterTools,
    },
    stopWhen: stepCountIs(6),
  });
}
