import { NextResponse } from "next/server";
import { CreditStore } from "@/lib/credits/credit-store";
import { getVerifiedWallet } from "@/lib/wallet-auth";

export async function GET(req: Request) {
  // Prefer signed cookie; fall back to query param for transition
  const verifiedWallet = getVerifiedWallet(req);
  const url = new URL(req.url);
  const queryWallet = url.searchParams.get("wallet");
  const wallet = verifiedWallet || queryWallet;

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "Invalid or missing wallet parameter" }, { status: 400 });
  }

  const account = await CreditStore.get(wallet);
  if (!account) {
    return NextResponse.json({ balanceMicroUsdc: 0 });
  }

  return NextResponse.json({ balanceMicroUsdc: account.balanceMicroUsdc });
}
