import { NextResponse } from "next/server";
import { z } from "zod";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { createPublicClient, http } from "viem";
import { getChain } from "@/lib/accounts";

const ClaimSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

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

  const client = createPublicClient({ chain: getChain(), transport: http() });
  const txCount = await client.getTransactionCount({
    address: walletAddress as `0x${string}`,
  });

  let grantMicroUsdc: number;
  if (txCount < 5) {
    grantMicroUsdc = MICRO_USDC(0.10);
  } else if (txCount < 50) {
    grantMicroUsdc = MICRO_USDC(0.25);
  } else {
    grantMicroUsdc = MICRO_USDC(0.50);
  }

  const newBalance = await CreditStore.grantFreeCredits(walletAddress, grantMicroUsdc);

  return NextResponse.json({
    granted: grantMicroUsdc,
    balance: newBalance,
  });
}
