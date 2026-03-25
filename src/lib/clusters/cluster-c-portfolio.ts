import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { telemetry } from "../telemetry";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup } from "./types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterCDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterCTools(deps: ClusterCDeps) {
  return {
    analyze_wallet_portfolio: tool({
      description:
        "Deep-dive analysis of a wallet address: risk profile, trade history, whale activity, and on-chain reputation. " +
        "Calls QuantumShield + SLAMai for cross-referenced intelligence. " +
        "Costs ~$0.02.",
      inputSchema: z.object({
        address: z
          .string()
          .regex(
            /^0x[0-9a-fA-F]{40}$/,
            "Must be a valid Ethereum address (0x + 40 hex chars)",
          )
          .describe("Wallet address to analyze (0x format)"),
      }),
      execute: async ({ address }): Promise<ClusterResult> => {
        const maxReservationMicro = 25_000;
        let reserved = false;

        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(
            deps.userWallet,
            maxReservationMicro,
          );
          if (!reservation.success) {
            return {
              summary: "Insufficient credit balance. Please top up.",
              serviceCalls: [],
              totalCostMicroUsdc: 0,
            };
          }
          reserved = true;
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];
        const ctx: PaymentContext = {
          walletClient: deps.walletClient,
          userWallet: deps.userWallet,
        };

        const clusterStart = Date.now();
        try {
          const serviceConfigs = [
            { name: "qs-wallet-risk", input: { address } },
            { name: "slamai-wallet", input: { address } },
            { name: "qs-whale-activity", input: { address } },
          ] as const;

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
              telemetry.serviceCall({
                cluster: "C",
                service: svc.name,
                latencyMs,
                success: true,
                costMicroUsdc: result.cost,
              });
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({
                cluster: "C",
                service: svc.name,
                latencyMs: Date.now() - svcStart,
                success: false,
                error: msg,
              });
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          const totalCost = calls.reduce(
            (sum, c) => sum + c.costMicroUsdc,
            0,
          );
          telemetry.clusterComplete({
            cluster: "C",
            tool: "analyze_wallet_portfolio",
            totalLatencyMs: Date.now() - clusterStart,
            servicesOk: calls.length,
            servicesFailed: errors.length,
            totalCostMicroUsdc: totalCost,
          });

          const failedNames = errors.map((e) => e.split(":")[0]);
          const successNames = calls.map((c) => c.serviceName);
          const summary =
            successNames.length > 0
              ? `Analyzed wallet ${address} using ${successNames.join(", ")}.` +
                (failedNames.length > 0
                  ? ` ${failedNames.join(", ")} temporarily unavailable.`
                  : "")
              : `Wallet Portfolio analysis unavailable — all services failed. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce(
              (sum, c) => sum + c.costMicroUsdc,
              0,
            );
            const unusedMicro = maxReservationMicro - applyMarkup(totalCost);
            if (unusedMicro > 0) {
              await CreditStore.release(
                deps.userWallet,
                unusedMicro,
              ).catch((err) => {
                console.error(
                  "[CLUSTER_C] Failed to release credit reservation",
                  { userWallet: deps.userWallet, unusedMicro, error: err },
                );
              });
            }
          }
        }
      },
    }),
  };
}
