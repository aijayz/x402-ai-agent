import { NextResponse } from "next/server";
import { getVerifiedWallet } from "@/lib/wallet-auth";
import { CreditStore } from "@/lib/credits/credit-store";

/** GET /api/auth/me — restore wallet session from HttpOnly cookie */
export async function GET(request: Request) {
  const walletAddress = getVerifiedWallet(request);
  if (!walletAddress) {
    return NextResponse.json({ authenticated: false });
  }

  const account = await CreditStore.getOrCreate(walletAddress);
  return NextResponse.json({
    authenticated: true,
    walletAddress,
    balanceMicroUsdc: account.balanceMicroUsdc,
  });
}
