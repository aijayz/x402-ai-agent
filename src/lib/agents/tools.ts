import { tool } from "ai";
import { z } from "zod";
import type { BudgetController } from "@/lib/budget-controller";

export function createBudgetTools(budget: BudgetController) {
  return {
    check_budget: tool({
      description: "Check remaining USDC budget for this session",
      inputSchema: z.object({}),
      execute: async () => ({
        remainingUsdc: budget.remainingUsdc(),
        spentUsdc: budget.sessionLimitUsdc - budget.remainingUsdc(),
        sessionLimitUsdc: budget.sessionLimitUsdc,
        history: budget.getHistory(),
      }),
    }),
  };
}
