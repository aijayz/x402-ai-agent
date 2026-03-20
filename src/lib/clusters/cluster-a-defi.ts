import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
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
        "Calls external x402 DeFi safety services (RugMunch, Augur, DiamondClaws). " +
        "Costs $0.12-$0.50 depending on depth.",
      inputSchema: z.object({
        target: z.string().describe("Token address, contract address, or token name to analyze"),
        depth: z.enum(["quick", "full"]).default("quick")
          .describe("'quick' = core scan only (~$0.12), 'full' = all services (~$0.50)"),
      }),
      execute: async ({ target, depth }): Promise<ClusterResult> => {
        const maxReservationMicro = depth === "full" ? 2_200_000 : 200_000;
        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return {
              summary: "Insufficient credit balance for this analysis. Please top up.",
              serviceCalls: [],
              totalCostMicroUsdc: 0,
            };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        if (env.RUGMUNCH_URL) {
          try {
            const result = await x402Fetch(
              `${env.RUGMUNCH_URL}/scan?target=${encodeURIComponent(target)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 2_000_000 },
            );
            calls.push({
              serviceName: "RugMunch",
              data: result.data,
              costMicroUsdc: result.amountMicroUsdc,
              paid: result.paid,
            });
          } catch (err) {
            errors.push(`RugMunch: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("RugMunch: not configured");
        }

        if (env.AUGUR_URL) {
          try {
            const result = await x402Fetch(
              `${env.AUGUR_URL}/analyze?address=${encodeURIComponent(target)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 200_000 },
            );
            calls.push({
              serviceName: "Augur",
              data: result.data,
              costMicroUsdc: result.amountMicroUsdc,
              paid: result.paid,
            });
          } catch (err) {
            errors.push(`Augur: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("Augur: not configured");
        }

        if (depth === "full" && env.DIAMONDCLAWS_URL) {
          try {
            const result = await x402Fetch(
              `${env.DIAMONDCLAWS_URL}/score?target=${encodeURIComponent(target)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 10_000 },
            );
            calls.push({
              serviceName: "DiamondClaws",
              data: result.data,
              costMicroUsdc: result.amountMicroUsdc,
              paid: result.paid,
            });
          } catch (err) {
            errors.push(`DiamondClaws: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) {
            await CreditStore.release(deps.userWallet, unusedMicro);
          }
        }

        const summary = calls.length > 0
          ? `Analyzed ${target} using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (errors.length > 0 ? `Unavailable: ${errors.join("; ")}` : "")
          : `No DeFi safety services available. ${errors.join("; ")}`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
      },
    }),
  };
}
