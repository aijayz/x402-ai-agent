import type {
  ReducedWhaleFlow,
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
 * Reduce a single token's whale flow from rows that already have inflow_usd/outflow_usd split.
 * Used for Ethereum ERC-20 tokens from the consolidated whale_flow_ethereum query.
 */
export function reduceWhaleFlowWithSplit(
  token: string,
  chain: string,
  rows: Row[],
): ReducedWhaleFlow {
  if (!rows.length) {
    return { token, chain, netFlowUsd: 0, inflowUsd: 0, outflowUsd: 0, largeTxCount: 0, totalVolumeUsd: 0, hasExchangeSplit: true };
  }

  let inflow = 0;
  let outflow = 0;
  let txCount = 0;
  let volume = 0;

  for (const row of rows) {
    inflow += num(row.inflow_usd);
    outflow += num(row.outflow_usd);
    txCount += num(row.large_tx_count ?? 1);
    volume += num(row.total_volume_usd);
  }

  return {
    token,
    chain,
    netFlowUsd: inflow - outflow,
    inflowUsd: inflow,
    outflowUsd: outflow,
    largeTxCount: txCount,
    totalVolumeUsd: volume,
    hasExchangeSplit: true,
  };
}

/**
 * Reduce volume-only whale flow (BTC/SOL/BNB — no exchange address split).
 * These chains only report total_volume_usd and large_tx_count.
 */
export function reduceWhaleFlowVolumeOnly(
  token: string,
  chain: string,
  raw: DuneCacheResult | null,
): ReducedWhaleFlow {
  if (!raw?.rows?.length) {
    return { token, chain, netFlowUsd: 0, inflowUsd: 0, outflowUsd: 0, largeTxCount: 0, totalVolumeUsd: 0, hasExchangeSplit: false };
  }

  let volume = 0;
  let txCount = 0;

  for (const row of raw.rows) {
    volume += num(row.total_volume_usd);
    txCount += num(row.large_tx_count);
  }

  return {
    token,
    chain,
    netFlowUsd: 0,
    inflowUsd: 0,
    outflowUsd: 0,
    largeTxCount: txCount,
    totalVolumeUsd: volume,
    hasExchangeSplit: false,
  };
}

/**
 * Legacy reducer: handles the old single-token whale_net_flow_7d format.
 * Used by cluster B which still calls the old-style template per-token.
 */
export function reduceWhaleFlow(
  token: string,
  chain: string,
  raw: DuneCacheResult | null,
): ReducedWhaleFlow {
  if (!raw?.rows?.length) {
    return { token, chain, netFlowUsd: 0, inflowUsd: 0, outflowUsd: 0, largeTxCount: 0, totalVolumeUsd: 0, hasExchangeSplit: true };
  }

  let inflow = 0;
  let outflow = 0;
  let txCount = 0;

  for (const row of raw.rows) {
    inflow += num(row.inflow_usd ?? row.inflow);
    outflow += num(row.outflow_usd ?? row.outflow);
    txCount += num(row.large_tx_count ?? row.tx_count ?? 1);

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

  const volume = num(raw.rows.reduce((s, r) => s + num(r.total_volume_usd), 0));

  return {
    token,
    chain,
    netFlowUsd: inflow - outflow,
    inflowUsd: inflow,
    outflowUsd: outflow,
    largeTxCount: txCount,
    totalVolumeUsd: volume || (inflow + outflow),
    hasExchangeSplit: true,
  };
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
 */
export function reduceSentiment(
  token: string,
  raw: unknown,
): ReducedSentiment {
  if (!raw || typeof raw !== "object") {
    return { token, score: null, label: null, summary: null };
  }

  const data = raw as Record<string, unknown>;

  const rawScore = num(data.score ?? data.sentiment_score ?? data.overall_score);
  const score = rawScore == null ? null
    : rawScore > 0 && rawScore < 1 ? Math.round(rawScore * 100)
    : rawScore < 0 ? Math.round((rawScore + 100) / 2)
    : rawScore > 100 ? 100
    : rawScore;

  const label = (
    data.label ??
    data.sentiment ??
    data.sentiment_label ??
    data.overall_sentiment
  ) as string | null;

  let summary: string | null = null;
  const rawSummary = data.summary ?? data.analysis ?? data.description;
  if (typeof rawSummary === "string") {
    const firstSentence = rawSummary.split(/[.!?]\s/)[0];
    summary = firstSentence ? firstSentence.slice(0, 200) : null;
  }

  return { token, score, label: label ? String(label).toLowerCase() : null, summary };
}
