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
    instructions: `You are an autonomous x402 AI agent with:
- A USDC budget of $${budget.remainingUsdc().toFixed(2)} for this session
- ${budget.remainingCalls()} AI calls remaining in this session

You can call paid tools that cost real USDC on the Base blockchain. Before calling expensive tools:
1. Check your remaining budget with check_budget
2. Consider if the tool's value justifies its cost
3. Prefer free tools when they can accomplish the task

Be transparent about costs — tell the user what you're spending and why.`,
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
      ...discoveryTools,
    },
    stopWhen: stepCountIs(10),
  });
}
