import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { telemetry } from "../telemetry";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import { applyMarkup, handleReleaseFailure, toQSChain } from "./types";
import type { ClusterResult, ServiceCallResult, ClusterChain } from "./types";
import { queryDune } from "../services/dune";
import type { DuneCacheResult } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";

interface ClusterFDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterFTools(deps: ClusterFDeps) {
  return {
    analyze_market_trends: tool({
      description:
        "Analyze market trends — social sentiment via GenVox plus optional smart contract audit via QuantumShield. " +
        "Costs ~$0.04.",
      inputSchema: z.object({
        query: z.string().describe("Market trend query, e.g. 'trending narratives', 'ETH sentiment this week'"),
        contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Optional: contract address (0x format) for contract audit"),
        chain: z.enum(["base", "ethereum", "arbitrum", "optimism"]).default("base")
          .describe("Chain for contract audit (default: base). Only matters if contractAddress is provided."),
      }),
      execute: async ({ query, contractAddress, chain }): Promise<ClusterResult> => {
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

        const clusterStart = Date.now();
        try {
          const qsChain = toQSChain(chain as ClusterChain);
          const serviceConfigs: { name: "genvox" | "qs-contract-audit"; input: Record<string, string> }[] = [
            { name: "genvox", input: { topic: query } },
          ];
          if (contractAddress) {
            serviceConfigs.push({ name: "qs-contract-audit", input: { address: contractAddress, chain: qsChain } });
          }

          // Dune temporal data (non-blocking)
          const dunePromises: Promise<DuneCacheResult | null>[] = [];
          const duneLabels: string[] = [];

          // DEX volume — only if we have a contract address
          if (contractAddress) {
            const dexTpl = getTemplate("dex_volume_7d");
            if (dexTpl && isTemplateReady(dexTpl)) {
              dunePromises.push(queryDune("dex_volume_7d", dexTpl.duneQueryId, { token_address: contractAddress, chain }).catch(() => null));
              duneLabels.push("dex_volume_7d");
            }
          }

          // Stablecoin supply trend — always available (chain-only param)
          const stableTpl = getTemplate("stablecoin_supply_trend");
          if (stableTpl && isTemplateReady(stableTpl)) {
            dunePromises.push(queryDune("stablecoin_supply_trend", stableTpl.duneQueryId, { chain }).catch(() => null));
            duneLabels.push("stablecoin_supply_trend");
          }

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
              telemetry.serviceCall({ cluster: "F", service: svc.name, latencyMs, success: true, costMicroUsdc: result.cost });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({ cluster: "F", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          // Await Dune results
          const duneResults = await duneResultsPromise;
          const duneData: Record<string, unknown> = {};
          for (let i = 0; i < duneLabels.length; i++) {
            if (duneResults[i]?.rows?.length) {
              duneData[duneLabels[i]] = duneResults[i]!.rows;
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
          telemetry.clusterComplete({ cluster: "F", tool: "analyze_market_trends", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Analyzed market trends using ${successNames.join(", ")}.` +
              (hasDune ? " Includes on-chain volume/supply data from Dune Analytics." : "") +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Market Trend Analysis unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - applyMarkup(totalCost);
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) =>
                handleReleaseFailure("CLUSTER_F", deps.userWallet!, unusedMicro, err),
              );
            }
          }
        }
      },
    }),
  };
}
