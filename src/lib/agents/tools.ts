import { tool } from "ai";
import { z } from "zod";
import type { BudgetController } from "@/lib/budget-controller";

export function createBudgetTools(budget: BudgetController) {
  return {
    check_budget: tool({
      description: "Check remaining USDC budget for this session",
      inputSchema: z.object({}),
      execute: async () => {
        const history = budget.getHistory();
        const totalSpentMicro = history.reduce((sum, h) => sum + h.amountMicroUsdc, 0);
        return {
          remainingUsdc: budget.remainingUsdc(),
          spentUsdc: totalSpentMicro / 1_000_000,
          history,
        };
      },
    }),
  };
}
