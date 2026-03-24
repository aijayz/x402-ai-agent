import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";
import { CreditStore } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { env } from "@/lib/env";
import { sql } from "@/lib/db";
import { sendTelegramAlert } from "@/lib/telegram";

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

  // Minimum deposit: $0.01 (10,000 micro-USDC)
  const MIN_DEPOSIT_MICRO = 10_000;
  if (amountMicro < MIN_DEPOSIT_MICRO) {
    return NextResponse.json(
      { error: `Minimum deposit is $0.01 USDC. Received $${(amountMicro / 1_000_000).toFixed(6)}` },
      { status: 400 }
    );
  }

  // Atomic: insert idempotency record + credit balance in one transaction.
  // If the idempotency INSERT conflicts (concurrent request), the whole tx is rolled back
  // and the second caller gets a clean "already_processed" on retry.
  try {
    const results = await sql.transaction([
      sql`
        INSERT INTO spend_events (
          wallet_address, tool_name,
          service_cost_micro_usdc, charged_amount_micro_usdc,
          markup_bps, tx_hash
        ) VALUES (
          ${walletAddress}, ${"topup"},
          ${0}, ${-amountMicro},
          ${0}, ${txHash}
        )
      `,
      sql`
        UPDATE credit_accounts
        SET balance_micro_usdc = balance_micro_usdc + ${amountMicro},
            updated_at = now()
        WHERE wallet_address = ${walletAddress}
        RETURNING balance_micro_usdc
      `,
    ]);

    const creditRows = results[1] as Array<Record<string, unknown>>;
    if (creditRows.length === 0) {
      return NextResponse.json(
        { error: "No credit account found for this wallet. Please connect your wallet first." },
        { status: 400 }
      );
    }

    const newBalance = Number(creditRows[0].balance_micro_usdc);
    const depositUsdc = (amountMicro / 1_000_000).toFixed(2);
    await sendTelegramAlert(
      `*Top-Up Received*\n\nWallet: \`${walletAddress}\`\nDeposit: *$${depositUsdc}* USDC\nNew balance: $${(newBalance / 1_000_000).toFixed(2)}\nTx: \`${txHash}\`\nNetwork: ${env.NETWORK}`
    );

    return NextResponse.json({
      credited: true,
      amountUsdc: amountMicro / 1_000_000,
      balanceMicroUsdc: newBalance,
    });
  } catch (err) {
    // If the INSERT hit a unique constraint (concurrent duplicate), treat as already processed
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      const account = await CreditStore.get(walletAddress);
      return NextResponse.json({
        credited: false,
        reason: "already_processed",
        balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
      });
    }
    console.error("[TOPUP_CONFIRM] Transaction failed", { walletAddress, txHash, error: err });
    return NextResponse.json({ error: "Failed to credit account" }, { status: 500 });
  }
}
