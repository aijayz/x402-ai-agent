import { NextResponse } from "next/server";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { CreditStore } from "@/lib/credits/credit-store";
import { getVerifiedWallet } from "@/lib/wallet-auth";

export async function GET(req: Request) {
  const wallet = getVerifiedWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [events, account] = await Promise.all([
    SpendEventStore.getRecent(wallet, 50),
    CreditStore.get(wallet),
  ]);

  // Build unified ledger: spend events + synthesized credit events
  // Top-ups are stored with toolName="topup" and negative chargedAmountMicroUsdc
  const ledger = events.map((e) => {
    const isTopUp = e.toolName === "topup" && e.chargedAmountMicroUsdc < 0;
    return {
      label: isTopUp ? "USDC Top-Up" : e.toolName,
      amountMicroUsdc: isTopUp ? Math.abs(e.chargedAmountMicroUsdc) : e.chargedAmountMicroUsdc,
      type: isTopUp ? ("credit" as const) : ("debit" as const),
      createdAt: e.createdAt.toISOString(),
    };
  });

  // Add free credits claim as a synthetic entry if granted
  if (account?.freeCreditsGranted && account.freeCreditsAmountMicroUsdc > 0) {
    ledger.push({
      label: "Free Credits",
      amountMicroUsdc: account.freeCreditsAmountMicroUsdc,
      type: "credit" as const,
      createdAt: account.createdAt.toISOString(),
    });
  }

  // Sort by date descending
  ledger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    ledger,
    balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
    lifetimeSpentMicroUsdc: account?.lifetimeSpentMicroUsdc ?? 0,
  });
}
