import { NextResponse } from "next/server";
import { ReportStore } from "@/lib/reports/report-store";
import type { DigestResponse } from "@/lib/api/types";

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date } = await params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }

    const digest = await ReportStore.getDigestByDate(date);
    if (!digest) {
      return NextResponse.json({ error: `No digest found for ${date}` }, { status: 404 });
    }

    const response: DigestResponse = {
      date: digest.digestDate ?? date,
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
    console.error("[API v1] digest/[date] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
