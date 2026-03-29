import { NextResponse } from "next/server";
import { checkPayment } from "@/lib/api/x402-paywall";
import { executeTokenAlpha } from "@/lib/api/research-handlers";
import { mapTokenAlphaResponse, wrapResponse } from "@/lib/api/response-mapper";
import { TOOL_PRICES } from "@/lib/tool-prices";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const target = body.target as string;
    const chain = (body.chain ?? "ethereum") as string;

    if (!target) {
      return NextResponse.json({ error: "Missing required field: target" }, { status: 400 });
    }

    const paywall = await checkPayment(req, TOOL_PRICES.screen_token_alpha, "/api/v1/research/token-alpha", "Token Alpha Screening");
    if (!paywall.authorized) return paywall.response!;

    const result = await executeTokenAlpha({ target, chain });
    await paywall.settle?.();
    const data = mapTokenAlphaResponse(result);

    return NextResponse.json(wrapResponse("token-alpha", result.summary, data, result.totalCostMicroUsdc));
  } catch (err) {
    console.error("[API v1] research/token-alpha error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
