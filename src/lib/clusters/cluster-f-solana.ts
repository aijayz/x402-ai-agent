import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterFDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterFTools(deps: ClusterFDeps) {
  return {
    analyze_solana_staking: tool({
      description:
        "Analyze Solana staking options — validator scoring, risk analysis, and stake simulations. " +
        "Calls Stakevia and Mycelia Signal x402 services. " +
        "Costs ~$1.25 (Stakevia is $1.00 + SOL price feed).",
      inputSchema: z.object({
        query: z.string().describe("Staking question, e.g. 'best validators', 'compare validator X vs Y'"),
      }),
      execute: async ({ query }): Promise<ClusterResult> => {
        const maxReservationMicro = 1_500_000;
        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance for staking analysis (~$1.25). Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        if (env.STAKEVIA_URL) {
          try {
            const result = await x402Fetch(
              `${env.STAKEVIA_URL}/analyze?q=${encodeURIComponent(query)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 1_200_000 },
            );
            calls.push({ serviceName: "Stakevia", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Stakevia: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("Stakevia: not configured");
        }

        if (env.MYCELIA_URL) {
          try {
            const result = await x402Fetch(
              `${env.MYCELIA_URL}/prices?symbols=SOL`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 10_000 },
            );
            calls.push({ serviceName: "Mycelia Signal", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Mycelia Signal: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) await CreditStore.release(deps.userWallet, unusedMicro);
        }

        const summary = calls.length > 0
          ? `Analyzed Solana staking using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (errors.length > 0 ? `Unavailable: ${errors.join("; ")}` : "")
          : `No staking analysis services available. ${errors.join("; ")}`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
      },
    }),
  };
}
