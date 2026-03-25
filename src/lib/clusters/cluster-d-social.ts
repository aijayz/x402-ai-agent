import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { telemetry } from "../telemetry";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup, handleReleaseFailure, augurSupportsChain, toQSChain } from "./types";
import type { ClusterResult, ServiceCallResult, ClusterChain } from "./types";

interface ClusterDDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterDTools(deps: ClusterDDeps) {
  return {
    analyze_social_narrative: tool({
      description:
        "Analyze social narrative and market sentiment for a token or topic — community sentiment, contract risk scoring, and wallet reputation. " +
        "Calls external x402 services (GenVox, Augur, QuantumShield). " +
        "Costs ~$0.17.",
      inputSchema: z.object({
        topic: z.string().describe("Topic to analyze, e.g. 'Solana sentiment', 'ETH merge narrative'"),
        chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base")
          .describe("Chain context for on-chain services (default: base). Only matters if topic is an address."),
      }),
      execute: async ({ topic, chain }): Promise<ClusterResult> => {
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

        const clusterStart = Date.now();
        try {
          // GenVox takes free-text topics; Augur and QS Wallet Risk need EVM addresses.
          // Only call address-based services if the topic looks like an address.
          const isAddress = /^0x[0-9a-fA-F]{40}$/.test(topic);
          const qsChain = toQSChain(chain as ClusterChain);
          const serviceConfigs: { name: "genvox" | "augur" | "qs-wallet-risk"; input: Record<string, string> }[] = [
            { name: "genvox", input: { topic } },
          ];
          if (isAddress) {
            if (augurSupportsChain(chain as ClusterChain)) {
              serviceConfigs.push({ name: "augur", input: { address: topic } });
            }
            serviceConfigs.push({ name: "qs-wallet-risk", input: { address: topic, chain: qsChain } });
          }

          for (const svc of serviceConfigs) {
            const svcStart = Date.now();
            try {
              const adapter = await getService(svc.name);
              const result = await adapter.call(svc.input, ctx);
              const latencyMs = Date.now() - svcStart;
              calls.push({
                serviceName: adapter.name,
                data: result.data,
                costMicroUsdc: result.cost,
                paid: result.cost > 0,
              });
              telemetry.serviceCall({ cluster: "D", service: svc.name, latencyMs, success: true, costMicroUsdc: result.cost });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({ cluster: "D", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          telemetry.clusterComplete({ cluster: "D", tool: "analyze_social_narrative", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Analyzed social narrative for "${topic}" using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Social Narrative Analysis unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - applyMarkup(totalCost);
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) =>
                handleReleaseFailure("CLUSTER_D", deps.userWallet!, unusedMicro, err),
              );
            }
          }
        }
      },
    }),
  };
}
