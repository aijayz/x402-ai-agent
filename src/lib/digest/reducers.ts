import type {
  ReducedWhaleFlow,
  ReducedCexFlow,
  ReducedStablecoinSupply,
  ReducedSentiment,
} from "./types";
import type { DuneCacheResult } from "@/lib/services/dune";

type Row = Record<string, unknown>;

function num(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reduce raw Dune whale_net_flow_7d rows to headline numbers.
 * Expected row shape: { day, inflow_usd, outflow_usd, net_flow_usd, large_tx_count }
 * (aggregated daily rows from our custom query)
 */
export function reduceWhaleFlow(
  token: string,
  chain: string,
  raw: DuneCacheResult | null,
): ReducedWhaleFlow {
  if (!raw?.rows?.length) {
    return { token, chain, netFlowUsd: 0, inflowUsd: 0, outflowUsd: 0, largeTxCount: 0 };
  }

  let inflow = 0;
  let outflow = 0;
  let txCount = 0;

  for (const row of raw.rows) {
    // Try aggregated columns first, then raw amount_usd
    inflow += num(row.inflow_usd ?? row.inflow);
    outflow += num(row.outflow_usd ?? row.outflow);
    txCount += num(row.large_tx_count ?? row.tx_count ?? 1);

    // If rows have a single net_flow/amount column instead of split in/out
    if (row.net_flow_usd !== undefined && row.inflow_usd === undefined) {
      const nf = num(row.net_flow_usd);
      if (nf > 0) inflow += nf;
      else outflow += Math.abs(nf);
    }
    if (row.amount_usd !== undefined && row.inflow_usd === undefined && row.net_flow_usd === undefined) {
      const amt = num(row.amount_usd);
      if (amt > 0) inflow += amt;
      else outflow += Math.abs(amt);
    }
  }

  return {
    token,
    chain,
    netFlowUsd: inflow - outflow,
    inflowUsd: inflow,
    outflowUsd: outflow,
    largeTxCount: txCount,
  };
}

/**
 * Reduce raw Dune cex_net_flow_7d rows to headline numbers.
 * Expected row shape: { day, net_flow_usd } or { day, inflow_usd, outflow_usd }
 */
export function reduceCexFlow(
  token: string,
  chain: string,
  raw: DuneCacheResult | null,
): ReducedCexFlow {
  if (!raw?.rows?.length) {
    return { token, chain, netFlowUsd: 0, direction: "neutral" };
  }

  let totalNet = 0;
  for (const row of raw.rows) {
    if (row.net_flow_usd !== undefined) {
      totalNet += num(row.net_flow_usd);
    } else {
      totalNet += num(row.inflow_usd) - num(row.outflow_usd);
    }
  }

  const direction = totalNet > 1_000
    ? "inflow" as const
    : totalNet < -1_000
      ? "outflow" as const
      : "neutral" as const;

  return { token, chain, netFlowUsd: totalNet, direction };
}

/**
 * Reduce raw Dune stablecoin_supply_trend rows to headline numbers.
 * Expected row shape: { day, total_supply_usd } — 30 daily data points
 */
export function reduceStablecoinSupply(
  chain: string,
  raw: DuneCacheResult | null,
): ReducedStablecoinSupply {
  if (!raw?.rows?.length) {
    return { chain, currentSupplyUsd: 0, change30dUsd: 0, changePercent: 0 };
  }

  // Sort by day ascending to get oldest and newest
  const sorted = [...raw.rows].sort((a, b) => {
    const da = String(a.day ?? a.block_date ?? a.date ?? "");
    const db = String(b.day ?? b.block_date ?? b.date ?? "");
    return da.localeCompare(db);
  });

  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  const current = num(newest.total_supply_usd ?? newest.supply ?? newest.total_supply);
  const old = num(oldest.total_supply_usd ?? oldest.supply ?? oldest.total_supply);
  const change = current - old;
  const pct = old > 0 ? (change / old) * 100 : 0;

  return {
    chain,
    currentSupplyUsd: current,
    change30dUsd: change,
    changePercent: Math.round(pct * 100) / 100,
  };
}

/**
 * Reduce raw GenVox sentiment response to headline numbers.
 * GenVox responses vary — extract score, label, and a short summary.
 */
export function reduceSentiment(
  token: string,
  raw: unknown,
): ReducedSentiment {
  if (!raw || typeof raw !== "object") {
    return { token, score: null, label: null, summary: null };
  }

  const data = raw as Record<string, unknown>;

  // Try common GenVox response shapes
  const score = num(data.score ?? data.sentiment_score ?? data.overall_score) || null;

  const label = (
    data.label ??
    data.sentiment ??
    data.sentiment_label ??
    data.overall_sentiment
  ) as string | null;

  // Extract a one-sentence summary if available
  let summary: string | null = null;
  const rawSummary = data.summary ?? data.analysis ?? data.description;
  if (typeof rawSummary === "string") {
    // Take first sentence only
    const firstSentence = rawSummary.split(/[.!?]\s/)[0];
    summary = firstSentence ? firstSentence.slice(0, 200) : null;
  }

  return { token, score, label: label ? String(label).toLowerCase() : null, summary };
}
