import { NextResponse } from "next/server";
import { CreditStore } from "@/lib/credits/credit-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "Invalid or missing wallet parameter" }, { status: 400 });
  }

  const account = await CreditStore.get(wallet);
  if (!account) {
    return NextResponse.json({ balanceMicroUsdc: 0 });
  }

  return NextResponse.json({ balanceMicroUsdc: account.balanceMicroUsdc });
}
