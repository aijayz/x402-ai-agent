import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterADeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterATools(deps: ClusterADeps) {
  return {
    analyze_defi_safety: tool({
      description:
        "Analyze a token or contract for rug pull risks, honeypot detection, and smart contract vulnerabilities. " +
        "Calls external x402 DeFi safety services (RugMunch, Augur, DiamondClaws). " +
        "Costs $0.12-$0.50 depending on depth.",
      inputSchema: z.object({
        target: z.string().describe("Token address, contract address, or token name to analyze"),
        depth: z.enum(["quick", "full"]).default("quick")
          .describe("'quick' = core scan only (~$0.12), 'full' = all services (~$0.50)"),
      }),
      execute: async ({ target, depth }): Promise<ClusterResult> => {
        const maxReservationMicro = depth === "full" ? 2_200_000 : 200_000;
        let reserved = false;

        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return {
              summary: "Insufficient credit balance for this analysis. Please top up.",
              serviceCalls: [],
              totalCostMicroUsdc: 0,
            };
          }
          reserved = true;
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];
        const ctx: PaymentContext = { walletClient: deps.walletClient, userWallet: deps.userWallet };

        try {
          const serviceNames = depth === "full"
            ? ["rug-munch", "augur", "diamond-claws"] as const
            : ["rug-munch", "augur"] as const;

          for (const name of serviceNames) {
            try {
              const adapter = await getService(name);
              const result = await adapter.call({ target }, ctx);
              calls.push({
                serviceName: adapter.name,
                data: result.data,
                costMicroUsdc: result.cost,
                paid: result.cost > 0,
              });
            } catch (err) {
              errors.push(`${name}: ${err instanceof Error ? err.message : "unavailable"}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Analyzed ${target} using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `DeFi Safety Analysis unavailable — all services failed to respond.`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - totalCost;
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) => {
                console.error("[CLUSTER_A] Failed to release credit reservation", {
                  userWallet: deps.userWallet, unusedMicro, error: err,
                });
              });
            }
          }
        }
      },
    }),
  };
}
