import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterFDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterFTools(deps: ClusterFDeps) {
  return {
    analyze_market_trends: tool({
      description:
        "Analyze market trends — sentiment analysis, liquidity analysis, and smart contract intelligence. " +
        "Calls external x402 services (GenVox, DiamondClaws, QuantumShield). " +
        "Costs ~$0.03.",
      inputSchema: z.object({
        query: z.string().describe("Market trend query, e.g. 'trending narratives', 'emerging tokens this week'"),
      }),
      execute: async ({ query }): Promise<ClusterResult> => {
        const maxReservationMicro = 100_000;
        let reserved = false;

        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance for market trend analysis. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
          reserved = true;
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];
        const ctx: PaymentContext = { walletClient: deps.walletClient, userWallet: deps.userWallet };

        try {
          const serviceConfigs = [
            { name: "genvox", input: { topic: query } },
            { name: "diamond-claws", input: { target: query } },
            { name: "qs-contract-audit", input: { address: query } },
          ] as const;

          for (const svc of serviceConfigs) {
            try {
              const adapter = await getService(svc.name);
              const result = await adapter.call(svc.input, ctx);
              calls.push({
                serviceName: adapter.name,
                data: result.data,
                costMicroUsdc: result.cost,
                paid: result.cost > 0,
              });
            } catch (err) {
              errors.push(`${svc.name}: ${err instanceof Error ? err.message : "unavailable"}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Analyzed market trends using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Market Trend Analysis unavailable — all services failed to respond.`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - totalCost;
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) => {
                console.error("[CLUSTER_F] Failed to release credit reservation", {
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
