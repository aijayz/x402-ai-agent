import { NextResponse } from "next/server";
import { checkPayment } from "@/lib/api/x402-paywall";
import { executeSocialNarrative } from "@/lib/api/research-handlers";
import { mapSocialNarrativeResponse, wrapResponse } from "@/lib/api/response-mapper";
import { TOOL_PRICES } from "@/lib/tool-prices";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const topic = body.topic as string;
    const chain = (body.chain ?? "ethereum") as string;

    if (!topic) {
      return NextResponse.json({ error: "Missing required field: topic" }, { status: 400 });
    }

    const paywall = await checkPayment(req, TOOL_PRICES.analyze_social_narrative, "/api/v1/research/social-narrative", "Social Narrative Analysis");
    if (!paywall.authorized) return paywall.response!;

    const result = await executeSocialNarrative({ topic, chain });
    await paywall.settle?.();
    const data = mapSocialNarrativeResponse(result);

    return NextResponse.json(wrapResponse("social-narrative", result.summary, data, result.totalCostMicroUsdc));
  } catch (err) {
    console.error("[API v1] research/social-narrative error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
