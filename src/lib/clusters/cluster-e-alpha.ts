import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { resolveTargetForMessari } from "../services/coingecko";
import { telemetry } from "../telemetry";
import { env } from "../env";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup, handleReleaseFailure, toQSChain } from "./types";
import type { ClusterResult, ServiceCallResult, ClusterChain } from "./types";
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";

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
        chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base")
          .describe("Chain the token is on (default: base). Use identify_address to determine the correct chain."),
      }),
      execute: async ({ target, chain }): Promise<ClusterResult> => {
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
          const qsChain = toQSChain(chain as ClusterChain);
          const serviceConfigs = [
            ...(isAddress
              ? [
                  { name: "qs-token-security" as const, input: { address: target, chain: qsChain } },
                ]
              : []),
            { name: "messari-token-unlocks" as const, input: { target: messariTarget } },
            { name: "messari-allocations" as const, input: { assetSymbol: messariTarget } },
          ];

          // Dune temporal data — only if input is an address (not name/symbol)
          const duneTemplates = ["smart_money_moves_7d", "token_velocity"] as const;
          const dunePromises = isAddress
            ? duneTemplates.map((tpl) => {
                const template = getTemplate(tpl);
                if (!template || !isTemplateReady(template)) return Promise.resolve(null);
                return queryDune(tpl, template.duneQueryId, { token_address: target, chain }).catch(() => null);
              })
            : [];
          const duneResultsPromise = Promise.all(dunePromises);

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

          // Await Dune results
          const duneResults = await duneResultsPromise;
          const duneData: Record<string, unknown> = {};
          for (let i = 0; i < duneTemplates.length; i++) {
            if (duneResults[i]?.rows?.length) {
              duneData[duneTemplates[i]] = duneResults[i]!.rows;
            }
          }
          const hasDune = Object.keys(duneData).length > 0;
          if (hasDune) {
            calls.push({
              serviceName: "Dune Analytics (temporal)",
              data: duneData,
              costMicroUsdc: 0,
              paid: false,
            });
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
                (hasDune ? " Includes smart money moves and token velocity from Dune Analytics." : "") +
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
              ).catch((err) =>
                handleReleaseFailure("CLUSTER_E", deps.userWallet!, unusedMicro, err),
              );
            }
          }
        }
      },
    }),
  };
}
