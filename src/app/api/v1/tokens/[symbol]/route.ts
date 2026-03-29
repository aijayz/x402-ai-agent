import { NextResponse } from "next/server";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import type { TokenSnapshotResponse } from "@/lib/api/types";

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    const snapshot = await TokenSnapshotStore.getBySymbol(symbol);

    if (!snapshot) {
      return NextResponse.json(
        { error: `No snapshot found for ${symbol.toUpperCase()}` },
        { status: 404 },
      );
    }

    const d = snapshot.data;
    const response: TokenSnapshotResponse = {
      symbol: snapshot.symbol,
      name: d.name,
      snapshotDate: snapshot.digestDate,
      security: d.security ?? null,
      whaleFlow: d.whaleFlow
        ? { netFlowUsd: d.whaleFlow.netFlowUsd, largeTxCount: d.whaleFlow.largeTxCount, totalVolumeUsd: d.whaleFlow.totalVolumeUsd }
        : null,
      sentiment: d.sentiment ?? null,
      unlocks: d.unlocks ?? null,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" },
    });
  } catch (err) {
    console.error("[API v1] tokens/[symbol] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
