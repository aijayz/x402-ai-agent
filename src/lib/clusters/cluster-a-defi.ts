import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import { resolveTargetForMessari } from "../services/coingecko";
import { env } from "../env";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterADeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterATools(deps: ClusterADeps) {
  return {
    analyze_defi_safety: tool({
      description:
        "Analyze a token or contract for rug pull risks, honeypot detection, and smart contract vulnerabilities. " +
        "Calls external x402 services (RugMunch, Augur, QuantumShield). " +
        "Costs $0.05-$0.15 depending on depth.",
      inputSchema: z.object({
        target: z.string().describe("Token address, contract address, or token name to analyze"),
        depth: z.enum(["quick", "full"]).default("quick")
          .describe("'quick' = core scan (~$0.05), 'full' = all services (~$0.15)"),
      }),
      execute: async ({ target, depth }): Promise<ClusterResult> => {
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

        try {
          // Quick: RugMunch + Augur + QS Token Security + Messari
          // Full: adds QS Contract Audit
          const serviceConfigs = depth === "full"
            ? [
                { name: "rug-munch", input: { target } },
                { name: "augur", input: { address: target } },
                { name: "qs-token-security", input: { address: target } },
                { name: "qs-contract-audit", input: { address: target } },
                { name: "messari-token-unlocks", input: { target: messariTarget } },
              ] as const
            : [
                { name: "rug-munch", input: { target } },
                { name: "augur", input: { address: target } },
                { name: "qs-token-security", input: { address: target } },
                { name: "messari-token-unlocks", input: { target: messariTarget } },
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
              console.error(`[CLUSTER_A] ${svc.name} failed:`, msg);
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Analyzed ${target} using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `DeFi Safety Analysis unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - totalCost;
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) => {
                console.error("[CLUSTER_A] Failed to release credit reservation", {
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
