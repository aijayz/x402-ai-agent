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
        "Analyze market intelligence — sentiment analysis, contract risk scoring, and wallet reputation for a token or topic. " +
        "Calls external x402 services (GenVox, Augur, QuantumShield). " +
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
          const serviceConfigs = [
            { name: "genvox", input: { topic } },
            { name: "augur", input: { address: topic } },
            { name: "qs-wallet-risk", input: { address: topic } },
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
              const msg = err instanceof Error ? err.message : "unavailable";
              console.error(`[CLUSTER_D] ${svc.name} failed:`, msg);
              errors.push(`${svc.name}: ${msg}`);
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
