import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { CreditStore } from "@/lib/credits/credit-store";
import { env } from "@/lib/env";

const TopUpSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = TopUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  await CreditStore.getOrCreate(parsed.data.walletAddress);

  const treasuryAccount = await getOrCreatePurchaserAccount();
  return NextResponse.json({
    depositAddress: treasuryAccount.address,
    network: env.NETWORK,
    asset: "USDC",
    minimumUsdc: 1.00,
    instructions: "Send USDC to this address on Base. Your balance will update automatically.",
  });
}
