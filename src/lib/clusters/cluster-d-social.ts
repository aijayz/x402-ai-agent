import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult, UnavailableService } from "./types";

interface ClusterDDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterDTools(deps: ClusterDDeps) {
  return {
    analyze_social_narrative: tool({
      description:
        "Analyze social media narrative and sentiment around a crypto topic. " +
        "Calls twit.sh (Twitter/X), Neynar (Farcaster), and Firecrawl (web scraping) x402 services. " +
        "Costs ~$0.03-$0.10.",
      inputSchema: z.object({
        topic: z.string().describe("Topic to analyze, e.g. 'Solana sentiment', 'ETH merge narrative'"),
      }),
      execute: async ({ topic }): Promise<ClusterResult> => {
        const unavailable: UnavailableService[] = [];
        const hasAnyService = !!(env.TWITSH_URL || env.NEYNAR_URL);
        const maxReservationMicro = 130_000;
        let reserved = false;

        if (hasAnyService && deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
          reserved = true;
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        try {
          if (env.TWITSH_URL) {
            try {
              const result = await x402Fetch(
                `${env.TWITSH_URL}/search?q=${encodeURIComponent(topic)}`,
                undefined,
                { walletClient: deps.walletClient, maxPaymentMicroUsdc: 50_000 },
              );
              calls.push({ serviceName: "twit.sh", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
            } catch (err) {
              errors.push(`twit.sh: ${err instanceof Error ? err.message : "unavailable"}`);
            }
          } else {
            unavailable.push({ name: "twit.sh", purpose: "Twitter/X crypto sentiment search", typicalCostUsdc: 0.03 });
          }

          if (env.NEYNAR_URL) {
            try {
              const result = await x402Fetch(
                `${env.NEYNAR_URL}/search?q=${encodeURIComponent(topic)}`,
                undefined,
                { walletClient: deps.walletClient, maxPaymentMicroUsdc: 50_000 },
              );
              calls.push({ serviceName: "Neynar", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
            } catch (err) {
              errors.push(`Neynar: ${err instanceof Error ? err.message : "unavailable"}`);
            }
          } else {
            unavailable.push({ name: "Neynar", purpose: "Farcaster social graph and cast search", typicalCostUsdc: 0.03 });
          }

          if (env.FIRECRAWL_URL) {
            try {
              const result = await x402Fetch(
                `${env.FIRECRAWL_URL}/scrape?q=${encodeURIComponent(topic)}`,
                undefined,
                { walletClient: deps.walletClient, maxPaymentMicroUsdc: 50_000 },
              );
              calls.push({ serviceName: "Firecrawl", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
            } catch (err) {
              errors.push(`Firecrawl: ${err instanceof Error ? err.message : "unavailable"}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

          const summary = calls.length > 0
            ? `Analyzed social narrative for "${topic}" using ${calls.map(c => c.serviceName).join(", ")}. ` +
              (unavailable.length > 0 ? `Not yet available: ${unavailable.map(u => u.name).join(", ")}` : "")
            : `Social Narrative Analysis requires external x402 services that aren't connected yet.`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost, unavailableServices: unavailable.length > 0 ? unavailable : undefined };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - totalCost;
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) => {
                console.error("[CLUSTER_D] Failed to release credit reservation", {
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
