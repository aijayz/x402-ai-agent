import { tool } from "ai";
import { z } from "zod";
import { getService } from "../services";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { PaymentContext } from "../services/types";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterBDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterBTools(deps: ClusterBDeps) {
  return {
    track_whale_activity: tool({
      description:
        "Track whale and smart money activity for a specific wallet address — risk scoring, holder analysis, and large transaction monitoring. " +
        "Requires a wallet address (0x format). " +
        "Calls external x402 services (WalletIQ, DiamondClaws, QuantumShield). " +
        "Costs ~$0.01.",
      inputSchema: z.object({
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid Ethereum address (0x + 40 hex chars)").describe("Wallet address to analyze (0x format, e.g. 0xabc123...)"),
      }),
      execute: async ({ address }): Promise<ClusterResult> => {
        const maxReservationMicro = 20_000;
        let reserved = false;

        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
          reserved = true;
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];
        const ctx: PaymentContext = { walletClient: deps.walletClient, userWallet: deps.userWallet };

        try {
          const serviceConfigs = [
            { name: "wallet-iq", input: { address } },
            { name: "diamond-claws", input: { target: address } },
            { name: "qs-whale-activity", input: { address } },
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
              console.error(`[CLUSTER_B] ${svc.name} failed:`, msg);
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const summary = successNames.length > 0
            ? `Tracked whale activity using ${successNames.join(", ")}.` +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Whale Intelligence unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
        } finally {
          if (reserved && deps.userWallet) {
            const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
            const unusedMicro = maxReservationMicro - totalCost;
            if (unusedMicro > 0) {
              await CreditStore.release(deps.userWallet, unusedMicro).catch((err) => {
                console.error("[CLUSTER_B] Failed to release credit reservation", {
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
