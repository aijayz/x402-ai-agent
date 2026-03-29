import { NextResponse } from "next/server";
import { checkPayment } from "@/lib/api/x402-paywall";
import { executeWalletPortfolio } from "@/lib/api/research-handlers";
import { mapWalletPortfolioResponse, wrapResponse } from "@/lib/api/response-mapper";
import { TOOL_PRICES } from "@/lib/tool-prices";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const address = body.address as string;
    const chain = (body.chain ?? "base") as string;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: "Missing or invalid field: address (must be 0x + 40 hex chars)" }, { status: 400 });
    }

    const paywall = await checkPayment(req, TOOL_PRICES.analyze_wallet_portfolio, "/api/v1/research/wallet-portfolio", "Wallet Portfolio Analysis");
    if (!paywall.authorized) return paywall.response!;

    const result = await executeWalletPortfolio({ address, chain });
    await paywall.settle?.();
    const data = mapWalletPortfolioResponse(result);

    return NextResponse.json(wrapResponse("wallet-portfolio", result.summary, data, result.totalCostMicroUsdc));
  } catch (err) {
    console.error("[API v1] research/wallet-portfolio error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
