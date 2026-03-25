import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { telemetry } from "../telemetry";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup, handleReleaseFailure, toQSChain, toSLAMaiChain } from "./types";
import type { ClusterResult, ServiceCallResult, ClusterChain } from "./types";

interface ClusterBDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterBTools(deps: ClusterBDeps) {
  return {
    track_whale_activity: tool({
      description:
        "Track whale and smart money activity. Pass a wallet or token contract address to see whale accumulation patterns, trade history, and risk profiles. " +
        "Requires an Ethereum address (0x format). To analyze a token like ETH or USDC, use get_crypto_price first to get its contract address. " +
        "Calls external x402 services (QuantumShield, SLAMai). " +
        "Costs ~$0.02.",
      inputSchema: z.object({
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid Ethereum address (0x + 40 hex chars)").describe("Wallet address or token contract address to analyze (0x format)"),
        chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base")
          .describe("Chain to query (default: base). Use identify_address to determine the correct chain."),
      }),
      execute: async ({ address, chain }): Promise<ClusterResult> => {
        const maxReservationMicro = 25_000;
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
          const qsChain = toQSChain(chain as ClusterChain);
          const serviceConfigs = [
            { name: "qs-wallet-risk" as const, input: { address, chain: qsChain } },
            { name: "qs-whale-activity" as const, input: { address, chain: qsChain } },
            { name: "slamai-wallet" as const, input: { address, blockchain: toSLAMaiChain(chain as ClusterChain) } },
          ];

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
              telemetry.serviceCall({ cluster: "B", service: svc.name, latencyMs, success: true, costMicroUsdc: result.cost });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({ cluster: "B", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          telemetry.clusterComplete({ cluster: "B", tool: "track_whale_activity", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Tracked whale activity using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Whale Intelligence unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - applyMarkup(totalCost);
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) =>
                handleReleaseFailure("CLUSTER_B", deps.userWallet!, unusedMicro, err),
              );
            }
          }
        }
      },
    }),
  };
}
