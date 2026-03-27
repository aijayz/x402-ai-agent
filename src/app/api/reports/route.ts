import { NextRequest, NextResponse } from "next/server";
import { ReportStore } from "@/lib/reports/report-store";
import { extractMarkers, extractTitle } from "@/lib/reports/parse-markers";
import { getVerifiedWallet } from "@/lib/wallet-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, title, metadata } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    // Get wallet from signed auth cookie (optional — anon users can share too)
    const walletAddress = getVerifiedWallet(req);

    const report = await ReportStore.create({
      walletAddress,
      title: title || extractTitle(content),
      content,
      markers: extractMarkers(content),
      metadata: metadata ?? undefined,
    });

    const url = `${req.nextUrl.origin}/r/${report.id}`;
    return NextResponse.json({ id: report.id, url });
  } catch (err) {
    console.error("[REPORTS] Create error", err);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}
