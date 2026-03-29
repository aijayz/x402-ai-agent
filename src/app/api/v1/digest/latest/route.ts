import { NextResponse } from "next/server";
import { ReportStore } from "@/lib/reports/report-store";
import type { DigestResponse } from "@/lib/api/types";

export async function GET() {
  try {
    const digest = await ReportStore.getLatestDigest();
    if (!digest) {
      return NextResponse.json({ error: "No digest available" }, { status: 404 });
    }

    const response: DigestResponse = {
      date: digest.digestDate ?? digest.createdAt.slice(0, 10),
      title: digest.title,
      content: digest.content,
      markers: digest.markers,
      tokenCount: Array.isArray(digest.markers) ? digest.markers.length : 0,
      generatedAt: digest.createdAt,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" },
    });
  } catch (err) {
    console.error("[API v1] digest/latest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
