import { tool } from "ai";
import { z } from "zod";
import type { BudgetController } from "@/lib/budget-controller";
import { identifyAddressAcrossChains } from "@/lib/services/coingecko";

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
    identify_address: tool({
      description:
        "Free tool. Identify what token/contract a 0x address belongs to and which chain it's on. " +
        "ALWAYS call this BEFORE using paid on-chain tools (analyze_contract, get_wallet_profile, analyze_defi_safety) " +
        "when the user provides an unfamiliar 0x address. This prevents wasting paid calls on addresses from the wrong chain.",
      inputSchema: z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("EVM address to identify"),
      }),
      execute: async ({ address }) => {
        const result = await identifyAddressAcrossChains(address);
        if (!result) {
          return { identified: false, note: "Address not found in CoinGecko across Ethereum, Base, Arbitrum, Optimism, or Polygon. It may be a wallet address or an unlisted contract." };
        }
        return {
          identified: true,
          symbol: result.symbol,
          name: result.name,
          chain: result.chain,
          isOnBase: result.chain === "base",
          note: result.chain !== "base"
            ? `This is ${result.name} (${result.symbol}) on ${result.chain}. On-chain analysis tools only cover Base — address-based lookups will not return useful data.`
            : `This is ${result.name} (${result.symbol}) on Base. Safe to use on-chain analysis tools.`,
        };
      },
    }),
  };
}
