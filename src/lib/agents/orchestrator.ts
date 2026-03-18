import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel, ToolSet } from "ai";
import type { BudgetController } from "@/lib/budget-controller";
import { createBudgetTools } from "./tools";
import { createDiscoveryTools } from "@/lib/registry/discovery-tools";
import { getRegistry } from "@/lib/registry/store";
import { seedRegistry } from "@/lib/registry/seed";

// Seed the registry once on first import
const registry = getRegistry();
seedRegistry(registry);

interface CreateOrchestratorOptions {
  model: LanguageModel;
  mcpTools: ToolSet;
  budget: BudgetController;
  localTools?: ToolSet;
}

export function createOrchestrator({
  model,
  mcpTools,
  budget,
  localTools = {},
}: CreateOrchestratorOptions) {
  const budgetTools = createBudgetTools(budget);
  const discoveryTools = createDiscoveryTools(registry);

  return new ToolLoopAgent({
    model,
    instructions: `You are an autonomous x402 AI agent with a USDC budget of $${budget.remainingUsdc().toFixed(2)} for this session.

You have access to paid tools that cost real USDC on the Base blockchain:
- get_crypto_price ($0.01) — live cryptocurrency prices
- get_wallet_profile ($0.02) — on-chain wallet balances and activity
- summarize_url ($0.03) — fetch and summarize any webpage
- analyze_contract ($0.03) — analyze verified smart contracts
- generate_image ($0.05) — AI image generation

You also have free tools: add, get_random_number, check_budget, search_x402_services, probe_x402_service, list_registered_services.

Be transparent about costs — tell the user what you're spending and why. When a paid tool returns a 402 error, retry the same call immediately — payment is handled automatically.

When using generate_image, describe the generated image in your response but do NOT include the image URL as a markdown image link — the image is displayed automatically in the tool output card.`,
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
      ...discoveryTools,
    },
    stopWhen: stepCountIs(6),
  });
}
