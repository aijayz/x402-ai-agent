import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http, parseEventLogs, erc20Abi } from "viem";
import { CreditStore } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { getChainConfig } from "@/lib/chains";
import { env } from "@/lib/env";
import { sql } from "@/lib/db";
import { sendTelegramAlert } from "@/lib/telegram";
import { getVerifiedWallet } from "@/lib/wallet-auth";

const ConfirmSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  sourceChain: z.string().default("base"),
});

export async function POST(req: Request) {
  // Require authenticated wallet cookie
  const verifiedWallet = getVerifiedWallet(req);
  if (!verifiedWallet) {
    return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { txHash, sourceChain } = parsed.data;
  // Use the verified wallet from cookie — ignore body's walletAddress
  const walletAddress = verifiedWallet;

  // Resolve chain config
  const chainConfig = getChainConfig(sourceChain, env.NETWORK);
  if (!chainConfig) {
    return NextResponse.json({ error: `Unsupported chain: ${sourceChain}` }, { status: 400 });
  }

  // Check idempotency — don't double-credit (scoped to chain)
  const alreadyProcessed = await SpendEventStore.existsByTxHashAndChain(txHash, sourceChain);
  if (alreadyProcessed) {
    const account = await CreditStore.get(walletAddress);
    return NextResponse.json({
      credited: false,
      reason: "already_processed",
      balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
    });
  }

  // Verify the tx on the selected chain
  const client = createPublicClient({
    chain: chainConfig.viemChain,
    transport: http(chainConfig.rpcUrl),
  });

  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (!receipt || receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction not confirmed or failed" }, { status: 400 });
  }

  // Parse USDC Transfer events from the receipt
  const usdcAddress = chainConfig.usdcAddress;

  const purchaser = await getOrCreatePurchaserAccount();
  const purchaserAddress = purchaser.address.toLowerCase();

  let transferAmount = BigInt(0);
  let senderMatch = false;

  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs.filter(
      (l) => l.address.toLowerCase() === usdcAddress.toLowerCase()
    ),
  });

  for (const t of transfers) {
    if (
      t.args.from.toLowerCase() === walletAddress.toLowerCase() &&
      t.args.to.toLowerCase() === purchaserAddress
    ) {
      senderMatch = true;
      transferAmount = t.args.value;
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
  try {
    const results = await sql.transaction([
      sql`
        INSERT INTO spend_events (
          wallet_address, tool_name,
          service_cost_micro_usdc, charged_amount_micro_usdc,
          markup_bps, tx_hash, source_chain
        ) VALUES (
          ${walletAddress}, ${"topup"},
          ${0}, ${-amountMicro},
          ${0}, ${txHash}, ${sourceChain}
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
      `*Top-Up Received (${chainConfig.name})*\n\nWallet: \`${walletAddress}\`\nDeposit: *$${depositUsdc}* USDC\nNew balance: $${(newBalance / 1_000_000).toFixed(2)}\nChain: ${chainConfig.name}\nTx: \`${txHash}\`\nNetwork: ${env.NETWORK}`
    );

    return NextResponse.json({
      credited: true,
      amountUsdc: amountMicro / 1_000_000,
      balanceMicroUsdc: newBalance,
    });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      const account = await CreditStore.get(walletAddress);
      return NextResponse.json({
        credited: false,
        reason: "already_processed",
        balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
      });
    }
    console.error("[TOPUP_CONFIRM] Transaction failed", { walletAddress, txHash, sourceChain, error: err });
    return NextResponse.json({ error: "Failed to credit account" }, { status: 500 });
  }
}
