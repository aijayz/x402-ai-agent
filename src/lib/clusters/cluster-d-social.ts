import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterDDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterDTools(deps: ClusterDDeps) {
  return {
    analyze_social_narrative: tool({
      description:
        "Analyze social media narrative and sentiment around a crypto topic. " +
        "Calls GenVox and Augur x402 services. " +
        "Costs ~$0.13.",
      inputSchema: z.object({
        topic: z.string().describe("Topic to analyze, e.g. 'Solana sentiment', 'ETH merge narrative'"),
      }),
      execute: async ({ topic }): Promise<ClusterResult> => {
        const maxReservationMicro = 200_000;
        let reserved = false;

        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
          reserved = true;
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];
        const ctx: PaymentContext = { walletClient: deps.walletClient, userWallet: deps.userWallet };

        try {
          const serviceNames = ["genvox", "augur"] as const;

          for (const name of serviceNames) {
            try {
              const adapter = await getService(name);
              const input = name === "genvox" ? { topic } : { address: topic };
              const result = await adapter.call(input, ctx);
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
            ? `Analyzed social narrative for "${topic}" using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Social Narrative Analysis unavailable — all services failed to respond.`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - totalCost;
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) => {
                console.error("[CLUSTER_D] Failed to release credit reservation", {
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
