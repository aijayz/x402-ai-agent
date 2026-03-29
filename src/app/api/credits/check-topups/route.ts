import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getOrCreatePurchaserAccount, getChain } from "@/lib/accounts";
import { createPublicClient, http, parseAbi } from "viem";
import { sendTelegramAlert } from "@/lib/telegram";

const USDC_ADDRESS: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Warn if house wallet USDC drops below this (in USDC, not micro)
const LOW_BALANCE_THRESHOLD = 5;

export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check house wallet USDC balance
  try {
    const purchaser = await getOrCreatePurchaserAccount();
    const publicClient = createPublicClient({
      chain: getChain(),
      transport: http(),
    });

    const balance = await publicClient.readContract({
      address: USDC_ADDRESS[env.NETWORK],
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [purchaser.address],
    });

    const balanceUsdc = Number(balance) / 1_000_000;

    if (balanceUsdc < LOW_BALANCE_THRESHOLD) {
      console.warn(`[CRON] LOW BALANCE: House wallet ${purchaser.address} has $${balanceUsdc.toFixed(2)} USDC (threshold: $${LOW_BALANCE_THRESHOLD})`);
      await sendTelegramAlert(
        `⚠️ *x402 Agent — Low Balance*\n\nHouse wallet \`${purchaser.address}\`\nBalance: *$${balanceUsdc.toFixed(2)}* USDC\nThreshold: $${LOW_BALANCE_THRESHOLD}\nNetwork: ${env.NETWORK}`
      );
    } else {
      console.log(`[CRON] House wallet balance: $${balanceUsdc.toFixed(2)} USDC`);
    }

    return NextResponse.json({
      ok: true,
      houseWallet: purchaser.address,
      balanceUsdc,
      lowBalance: balanceUsdc < LOW_BALANCE_THRESHOLD,
    });
  } catch (err) {
    console.error("[CRON] Failed to check house wallet balance", err);
    await sendTelegramAlert(
      `🔴 *x402 Agent — Cron Error*\n\nFailed to check house wallet balance.\nError: ${err instanceof Error ? err.message : "Unknown"}\nNetwork: ${env.NETWORK}`
    );
    return NextResponse.json({ ok: false, error: "Failed to check balance" }, { status: 500 });
  }
}
