import { NextResponse } from "next/server";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import { FIXED_TOKEN_SYMBOLS } from "@/lib/token-pages/fixed-symbols";
import type { TokenListResponse } from "@/lib/api/types";

const fixedSet = new Set(FIXED_TOKEN_SYMBOLS);

export async function GET() {
  try {
    const [symbols, latestDate] = await Promise.all([
      TokenSnapshotStore.getAllSymbols(),
      TokenSnapshotStore.getLatestSnapshotDate(),
    ]);

    const response: TokenListResponse = {
      tokens: symbols.map((s) => ({
        symbol: s,
        category: fixedSet.has(s) ? "fixed" as const : "mover" as const,
      })),
      snapshotDate: latestDate ?? new Date().toISOString().slice(0, 10),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" },
    });
  } catch (err) {
    console.error("[API v1] tokens error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
