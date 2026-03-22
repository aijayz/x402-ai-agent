import { NextResponse } from "next/server";
import { z } from "zod";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { getWalletAgeDays } from "@/lib/credits/wallet-age";
import { env } from "@/lib/env";

const ClaimSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

/**
 * Determine free credit grant based on wallet age (Sybil guard).
 * Older wallets get more credits — fresh wallets are likely farming.
 */
function grantAmountFromAge(ageDays: number | null): number {
  if (ageDays == null) return MICRO_USDC(0.10); // API failed — grant minimum
  if (ageDays < 7) return MICRO_USDC(0.10);
  if (ageDays < 30) return MICRO_USDC(0.25);
  return MICRO_USDC(0.50);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const { walletAddress } = parsed.data;
  const account = await CreditStore.getOrCreate(walletAddress);

  if (account.freeCreditsGranted) {
    return NextResponse.json({
      error: "Free credits already claimed for this wallet",
      balance: account.balanceMicroUsdc,
    }, { status: 409 });
  }

  // Check wallet age via Basescan (free, no API key needed)
  const ageDays = await getWalletAgeDays(walletAddress, env.NETWORK);
  const grantMicroUsdc = grantAmountFromAge(ageDays);

  const newBalance = await CreditStore.grantFreeCredits(walletAddress, grantMicroUsdc);

  return NextResponse.json({
    granted: grantMicroUsdc,
    balance: newBalance,
    walletAgeDays: ageDays,
  });
}
