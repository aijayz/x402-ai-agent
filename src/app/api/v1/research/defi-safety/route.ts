import { NextResponse } from "next/server";
import { checkPayment } from "@/lib/api/x402-paywall";
import { executeDefiSafety } from "@/lib/api/research-handlers";
import { mapDefiSafetyResponse, wrapResponse } from "@/lib/api/response-mapper";
import { TOOL_PRICES } from "@/lib/tool-prices";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const target = body.target as string;
    const depth = (body.depth ?? "quick") as "quick" | "full";
    const chain = (body.chain ?? "ethereum") as string;

    if (!target) {
      return NextResponse.json({ error: "Missing required field: target" }, { status: 400 });
    }

    const price = depth === "full" ? TOOL_PRICES.analyze_defi_safety_full : TOOL_PRICES.analyze_defi_safety;
    const paywall = await checkPayment(req, price, "/api/v1/research/defi-safety", "DeFi Safety Analysis");
    if (!paywall.authorized) return paywall.response!;

    const result = await executeDefiSafety({ target, depth, chain });
    await paywall.settle?.();
    const data = mapDefiSafetyResponse(result);

    return NextResponse.json(wrapResponse("defi-safety", result.summary, data, result.totalCostMicroUsdc));
  } catch (err) {
    console.error("[API v1] research/defi-safety error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
