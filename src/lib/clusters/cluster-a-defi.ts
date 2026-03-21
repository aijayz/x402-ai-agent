import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult, UnavailableService } from "./types";

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
        const unavailable: UnavailableService[] = [];
        const hasAnyService = !!(env.RUGMUNCH_URL || env.AUGUR_URL || (depth === "full" && env.DIAMONDCLAWS_URL));
        const maxReservationMicro = depth === "full" ? 2_200_000 : 200_000;

        if (hasAnyService && deps.userWallet) {
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
          unavailable.push({ name: "RugMunch", purpose: "Rug pull detection and honeypot scanning", typicalCostUsdc: 0.05 });
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
          unavailable.push({ name: "Augur", purpose: "Smart contract vulnerability analysis", typicalCostUsdc: 0.05 });
        }

        if (depth === "full") {
          if (env.DIAMONDCLAWS_URL) {
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
          } else {
            unavailable.push({ name: "DiamondClaws", purpose: "Diamond hands scoring and holder analysis", typicalCostUsdc: 0.01 });
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (hasAnyService && deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) {
            await CreditStore.release(deps.userWallet, unusedMicro);
          }
        }

        const summary = calls.length > 0
          ? `Analyzed ${target} using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (unavailable.length > 0 ? `Not yet available: ${unavailable.map(u => u.name).join(", ")}` : "")
          : `DeFi Safety Analysis requires external x402 services that aren't connected yet.`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost, unavailableServices: unavailable.length > 0 ? unavailable : undefined };
      },
    }),
  };
}
