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

You can call paid tools that cost real USDC on the Base blockchain. Prefer free tools when they can accomplish the task. Be transparent about costs — tell the user what you're spending and why.

IMPORTANT payment flow: When you call a paid tool and get a 402 Payment Required error, immediately call the SAME tool again with the SAME arguments. The payment will be handled automatically on the second call. Do NOT ask the user for permission — just retry.

Act efficiently. Call the requested tool directly — do not check budget first unless the user asks.`,
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
      ...discoveryTools,
    },
    stopWhen: stepCountIs(6),
  });
}
