import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult, UnavailableService } from "./types";

interface ClusterBDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterBTools(deps: ClusterBDeps) {
  return {
    track_whale_activity: tool({
      description:
        "Track whale and smart money activity — what large wallets are buying/selling. " +
        "Calls Einstein AI, SLAMai, and Mycelia Signal x402 services. " +
        "Costs ~$0.05-$0.15 depending on available services.",
      inputSchema: z.object({
        query: z.string().describe("What to track, e.g. 'what are whales buying', 'smart money flows ETH'"),
      }),
      execute: async ({ query }): Promise<ClusterResult> => {
        const unavailable: UnavailableService[] = [];
        const hasAnyService = !!(env.EINSTEIN_AI_URL || env.SLAMAI_URL);
        const maxReservationMicro = 200_000;

        if (hasAnyService && deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        if (env.EINSTEIN_AI_URL) {
          try {
            const result = await x402Fetch(
              `${env.EINSTEIN_AI_URL}/whales?q=${encodeURIComponent(query)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 100_000 },
            );
            calls.push({ serviceName: "Einstein AI", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Einstein AI: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          unavailable.push({ name: "Einstein AI", purpose: "Whale wallet tracking and large transaction alerts", typicalCostUsdc: 0.05 });
        }

        if (env.SLAMAI_URL) {
          try {
            const result = await x402Fetch(
              `${env.SLAMAI_URL}/smart-money?q=${encodeURIComponent(query)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 100_000 },
            );
            calls.push({ serviceName: "SLAMai", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`SLAMai: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          unavailable.push({ name: "SLAMai", purpose: "Smart money flow analysis", typicalCostUsdc: 0.05 });
        }

        if (env.MYCELIA_URL) {
          try {
            const result = await x402Fetch(
              `${env.MYCELIA_URL}/prices?symbols=BTC,ETH,SOL`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 10_000 },
            );
            calls.push({ serviceName: "Mycelia Signal", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Mycelia Signal: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (hasAnyService && deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) await CreditStore.release(deps.userWallet, unusedMicro);
        }

        const summary = calls.length > 0
          ? `Tracked whale activity using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (unavailable.length > 0 ? `Not yet available: ${unavailable.map(u => u.name).join(", ")}` : "")
          : `Whale Intelligence requires external x402 services that aren't connected yet.`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost, unavailableServices: unavailable.length > 0 ? unavailable : undefined };
      },
    }),
  };
}
