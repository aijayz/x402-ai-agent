import { NextRequest, NextResponse } from "next/server";
import { ReportStore } from "@/lib/reports/report-store";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, title, metadata } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    // Get wallet from auth cookie (optional — anon users can share too)
    const cookieStore = await cookies();
    const walletCookie = cookieStore.get("wallet_auth");
    let walletAddress: string | null = null;
    if (walletCookie?.value) {
      try {
        const parsed = JSON.parse(walletCookie.value);
        walletAddress = parsed.address ?? null;
      } catch { /* ignore */ }
    }

    const report = await ReportStore.create({
      walletAddress,
      title: title || extractTitle(content),
      content,
      metadata: metadata ?? undefined,
    });

    const url = `${req.nextUrl.origin}/r/${report.id}`;
    return NextResponse.json({ id: report.id, url });
  } catch (err) {
    console.error("[REPORTS] Create error", err);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}

/** Extract a title from report content */
function extractTitle(content: string): string {
  // Try VERDICT marker
  const verdictMatch = content.match(/\[VERDICT:([^|]+)\|/);
  if (verdictMatch) return verdictMatch[1].trim().slice(0, 100);

  // Try first bold line
  const boldMatch = content.match(/\*\*([^*]+)\*\*/);
  if (boldMatch) return boldMatch[1].trim().slice(0, 100);

  // Fallback
  return `Obol Analysis — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
