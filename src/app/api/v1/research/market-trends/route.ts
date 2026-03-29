import { NextResponse } from "next/server";
import { checkPayment } from "@/lib/api/x402-paywall";
import { executeMarketTrends } from "@/lib/api/research-handlers";
import { mapMarketTrendsResponse, wrapResponse } from "@/lib/api/response-mapper";
import { TOOL_PRICES } from "@/lib/tool-prices";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = body.query as string;
    const contractAddress = body.contractAddress as string | undefined;
    const chain = (body.chain ?? "ethereum") as string;

    if (!query) {
      return NextResponse.json({ error: "Missing required field: query" }, { status: 400 });
    }

    if (contractAddress && !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
      return NextResponse.json({ error: "Invalid contractAddress (must be 0x + 40 hex chars)" }, { status: 400 });
    }

    const paywall = await checkPayment(req, TOOL_PRICES.analyze_market_trends, "/api/v1/research/market-trends", "Market Trends Analysis");
    if (!paywall.authorized) return paywall.response!;

    const result = await executeMarketTrends({ query, contractAddress, chain });
    await paywall.settle?.();
    const data = mapMarketTrendsResponse(result);

    return NextResponse.json(wrapResponse("market-trends", result.summary, data, result.totalCostMicroUsdc));
  } catch (err) {
    console.error("[API v1] research/market-trends error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
