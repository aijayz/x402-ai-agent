import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { resolveTargetForMessari } from "../services/coingecko";
import { telemetry } from "../telemetry";
import { env } from "../env";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup } from "./types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterEDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterETools(deps: ClusterEDeps) {
  return {
    screen_token_alpha: tool({
      description:
        "Screen a token for alpha signals: security score, unlock schedule, and detailed allocation breakdown (investor/team/foundation splits). " +
        "Calls QuantumShield (token security), Messari (unlock schedule + allocations). " +
        "Accepts a token name/symbol (e.g. 'AERO', 'cbBTC') or contract address. " +
        "Costs ~$0.33.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Token name, symbol (e.g. 'ETH', 'AERO'), or contract address (0x format)",
          ),
      }),
      execute: async ({ target }): Promise<ClusterResult> => {
        const maxReservationMicro = 500_000;
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

        // For Messari: resolve contract address → symbol (Messari matches on name/symbol only)
        const messariTarget = await resolveTargetForMessari(target, env.NETWORK);

        // QS token security and SLAMai holder reputation both need a contract address.
        // If target is not a 0x address, only run Messari (which works on name/symbol).
        const isAddress = /^0x[0-9a-fA-F]{40}$/.test(target);

        const clusterStart = Date.now();
        try {
          const serviceConfigs = [
            ...(isAddress
              ? [
                  { name: "qs-token-security" as const, input: { address: target } },
                ]
              : []),
            { name: "messari-token-unlocks" as const, input: { target: messariTarget } },
            { name: "messari-allocations" as const, input: { assetSymbol: messariTarget } },
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
              telemetry.serviceCall({
                cluster: "E",
                service: svc.name,
                latencyMs,
                success: true,
                costMicroUsdc: result.cost,
              });
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({
                cluster: "E",
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
            cluster: "E",
            tool: "screen_token_alpha",
            totalLatencyMs: Date.now() - clusterStart,
            servicesOk: calls.length,
            servicesFailed: errors.length,
            totalCostMicroUsdc: totalCost,
          });

          const failedNames = errors.map((e) => e.split(":")[0]);
          const successNames = calls.map((c) => c.serviceName);
          const summary =
            successNames.length > 0
              ? `Screened ${target} using ${successNames.join(", ")}.` +
                (!isAddress
                  ? " Tip: pass a contract address for full security + holder analysis."
                  : "") +
                (failedNames.length > 0
                  ? ` ${failedNames.join(", ")} temporarily unavailable.`
                  : "")
              : `Token alpha screening unavailable — all services failed. Errors: ${errors.join("; ")}`;

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
                  "[CLUSTER_E] Failed to release credit reservation",
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
