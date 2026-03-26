import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { resolveTargetForMessari } from "../services/coingecko";
import { telemetry } from "../telemetry";
import { env } from "../env";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup, handleReleaseFailure, augurSupportsChain, toQSChain } from "./types";
import type { ClusterResult, ServiceCallResult, ClusterChain } from "./types";
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";

interface ClusterADeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterATools(deps: ClusterADeps) {
  return {
    analyze_defi_safety: tool({
      description:
        "Analyze a token or contract for rug pull risks, honeypot detection, and smart contract vulnerabilities. " +
        "Calls external x402 services (Augur, QuantumShield, Messari). " +
        "Costs $0.05-$0.15 depending on depth.",
      inputSchema: z.object({
        target: z.string().describe("Token address, contract address, or token name to analyze"),
        depth: z.enum(["quick", "full"]).default("quick")
          .describe("'quick' = core scan (~$0.05), 'full' = all services (~$0.15)"),
        chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base")
          .describe("Chain the token is on (default: base). Use identify_address to determine the correct chain."),
      }),
      execute: async ({ target, depth, chain }): Promise<ClusterResult> => {
        const maxReservationMicro = depth === "full" ? 300_000 : 150_000;
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

        // Resolve contract address → symbol for Messari (which matches on name/symbol only)
        const messariTarget = await resolveTargetForMessari(target, env.NETWORK);
        const clusterStart = Date.now();

        try {
          // Quick: Augur (Base only) + QS Token Security + Messari
          // Full: adds QS Contract Audit
          const qsChain = toQSChain(chain as ClusterChain);
          const baseServices = [
            ...(augurSupportsChain(chain as ClusterChain)
              ? [{ name: "augur" as const, input: { address: target } }]
              : []),
            { name: "qs-token-security" as const, input: { address: target, chain: qsChain } },
            { name: "messari-token-unlocks" as const, input: { target: messariTarget } },
          ];
          const serviceConfigs = depth === "full"
            ? [...baseServices.slice(0, -1),
               { name: "qs-contract-audit" as const, input: { address: target, chain: qsChain } },
               ...baseServices.slice(-1)]
            : baseServices;

          // Dune temporal data (non-blocking — null on failure)
          const duneTemplates = ["liquidation_risk", "dex_pair_depth"] as const;
          const dunePromises = duneTemplates.map((tpl) => {
            const template = getTemplate(tpl);
            if (!template || !isTemplateReady(template)) return Promise.resolve(null);
            return queryDune(tpl, template.duneQueryId, { token_address: target, chain }).catch(() => null);
          });
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
              telemetry.serviceCall({ cluster: "A", service: svc.name, latencyMs, success: true, costMicroUsdc: result.cost });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({ cluster: "A", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
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

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          telemetry.clusterComplete({ cluster: "A", tool: "analyze_defi_safety", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Analyzed ${target} using ${successNames.join(", ")}.` +
              (hasDune ? " Includes liquidation risk and liquidity depth from Dune Analytics." : "") +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `DeFi Safety Analysis unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - applyMarkup(totalCost);
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) =>
                handleReleaseFailure("CLUSTER_A", deps.userWallet!, unusedMicro, err),
              );
            }
          }
        }
      },
    }),
  };
}
