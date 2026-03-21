import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { env } from "@/lib/env";

const USDC_ADDRESS: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

const ConfirmSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { walletAddress, txHash } = parsed.data;

  // Check idempotency — don't double-credit
  const alreadyProcessed = await SpendEventStore.existsByTxHash(txHash);
  if (alreadyProcessed) {
    // Already credited — just return current balance
    const account = await CreditStore.get(walletAddress);
    return NextResponse.json({
      credited: false,
      reason: "already_processed",
      balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
    });
  }

  // Verify the tx on-chain
  const chain = env.NETWORK === "base" ? base : baseSepolia;
  const client = createPublicClient({ chain, transport: http() });

  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (!receipt || receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction not confirmed or failed" }, { status: 400 });
  }

  // Parse USDC Transfer events from the receipt
  const usdcAddress = USDC_ADDRESS[env.NETWORK];

  const purchaser = await getOrCreatePurchaserAccount();
  const purchaserAddress = purchaser.address.toLowerCase();

  let transferAmount = BigInt(0);
  let senderMatch = false;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== usdcAddress.toLowerCase()) continue;

    try {
      // Manual decode: Transfer topic + indexed from/to + value
      const from = ("0x" + log.topics[1]?.slice(26)) as string;
      const to = ("0x" + log.topics[2]?.slice(26)) as string;

      if (
        from.toLowerCase() === walletAddress.toLowerCase() &&
        to.toLowerCase() === purchaserAddress
      ) {
        senderMatch = true;
        transferAmount = BigInt(log.data);
      }
    } catch {
      continue;
    }
  }

  if (!senderMatch || transferAmount === BigInt(0)) {
    return NextResponse.json(
      { error: "No matching USDC transfer found in this transaction" },
      { status: 400 }
    );
  }

  // USDC has 6 decimals — transferAmount is already in micro-USDC
  const amountMicro = Number(transferAmount);

  // Credit the user
  const newBalance = await CreditStore.credit(walletAddress, amountMicro);

  // Record for idempotency
  await SpendEventStore.record({
    walletAddress,
    toolName: "topup",
    serviceCostMicroUsdc: 0,
    chargedAmountMicroUsdc: -amountMicro, // negative = credit
    markupBps: 0,
    txHash,
  });

  return NextResponse.json({
    credited: true,
    amountUsdc: amountMicro / 1_000_000,
    balanceMicroUsdc: newBalance,
  });
}
