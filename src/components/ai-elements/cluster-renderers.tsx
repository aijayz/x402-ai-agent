"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/* ─── Shared helpers ─── */

function RiskGauge({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const color =
    pct <= 30 ? "bg-green-500" : pct <= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{score}</span>
    </div>
  );
}

function SentimentBar({ score, label }: { score: number; label?: string }) {
  // score is 0-1 (or -1 to 1 for GenVox — normalise to 0-100)
  const pct = Math.min(100, Math.max(0, score * 100));
  const color =
    pct >= 65 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-20 text-right truncate">
        {label ?? `${(pct).toFixed(0)}%`}
      </span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-center min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold truncate">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BoolFlag({ label, value, invert }: { label: string; value: boolean; invert?: boolean }) {
  const bad = invert ? !value : value;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${bad ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
      {bad ? "!" : "✓"} {label}
    </span>
  );
}

function AllocationBar({ category, percentage, locked, unlocked }: { category: string; percentage: number; locked: number; unlocked: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate">{category}</span>
        <span className="font-mono">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden flex">
        {unlocked > 0 && (
          <div
            className="h-full bg-blue-500"
            style={{ width: `${(unlocked / percentage) * 100}%` }}
            title={`Unlocked: ${unlocked.toFixed(1)}%`}
          />
        )}
        {locked > 0 && (
          <div
            className="h-full bg-blue-500/30"
            style={{ width: `${(locked / percentage) * 100}%` }}
            title={`Locked: ${locked.toFixed(1)}%`}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Per-service renderers ─── */

function renderAugur(data: any): ReactNode {
  if (!data?.predictionMarkets) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">{data.overallSentiment}</Badge>
        <span className="text-[10px] text-muted-foreground">Confidence: {((data.confidence ?? 0) * 100).toFixed(0)}%</span>
      </div>
      {data.predictionMarkets.map((m: any, i: number) => (
        <div key={i} className="rounded bg-muted/20 px-2.5 py-1.5 text-xs space-y-0.5">
          <div className="text-muted-foreground">{m.question}</div>
          <div className="flex items-center gap-3">
            <span className="font-mono font-medium">{(m.yesPrice * 100).toFixed(0)}% Yes</span>
            <span className="text-muted-foreground">${(m.volume24h / 1000).toFixed(0)}K vol</span>
            {m.resolution !== "unresolved" && (
              <Badge variant="outline" className="text-[10px]">{m.resolution}</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderGenvox(data: any): ReactNode {
  if (data?.sentiment == null && data?.sentimentScore == null) return null;
  const score = data.score ?? data.sentimentScore ?? 0.5;
  const label = data.sentiment ?? data.sentimentLabel ?? "unknown";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium capitalize">{label}</span>
        {data.trending && <Badge variant="secondary" className="text-[10px]">Trending</Badge>}
      </div>
      <SentimentBar score={score} label={`${(score * 100).toFixed(0)}%`} />
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {data.volume != null && <span>{data.volume.toLocaleString()} mentions</span>}
        {data.sources?.length > 0 && <span>via {data.sources.join(", ")}</span>}
      </div>
    </div>
  );
}

function renderQsTokenSecurity(data: any): ReactNode {
  if (data?.riskScore == null && data?.honeypot == null) return null;
  return (
    <div className="space-y-2">
      {data.riskScore != null && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Risk Score</div>
          <RiskGauge score={data.riskScore} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {data.honeypot != null && <BoolFlag label="Honeypot" value={data.honeypot} />}
        {data.mintable != null && <BoolFlag label="Mintable" value={data.mintable} />}
        {data.proxy != null && <BoolFlag label="Proxy" value={data.proxy} />}
      </div>
      {data.taxRate != null && (
        <div className="text-xs text-muted-foreground">
          Tax Rate: <span className="font-mono">{(data.taxRate * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function renderQsContractAudit(data: any): ReactNode {
  if (data?.securityScore == null) return null;
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Security Score</div>
        <RiskGauge score={100 - data.securityScore} />
        <div className="text-xs text-muted-foreground mt-0.5">{data.securityScore}/100</div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {data.compiler && <span className="font-mono">Solidity {data.compiler}</span>}
        {data.optimization != null && (
          <Badge variant="secondary" className="text-[10px]">{data.optimization ? "Optimized" : "Not optimized"}</Badge>
        )}
      </div>
      {data.issues?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.issues.map((issue: string, i: number) => (
            <span key={i} className="rounded bg-red-500/15 text-red-400 px-1.5 py-0.5 text-[10px] font-medium">
              {issue}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function renderQsWalletRisk(data: any): ReactNode {
  if (data?.riskScore == null && data?.labels == null) return null;
  return (
    <div className="space-y-2">
      {data.riskScore != null && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Wallet Risk</div>
          <RiskGauge score={data.riskScore} />
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {data.txCount != null && <span>{data.txCount.toLocaleString()} txns</span>}
        {data.age && <span>Age: {data.age}</span>}
      </div>
      {data.labels?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.labels.map((label: string, i: number) => {
            const risky = /tornado|scam|hack|exploit|sanctioned/i.test(label);
            return (
              <Badge key={i} variant={risky ? "destructive" : "secondary"} className="text-[10px]">
                {label}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderQsWhaleActivity(data: any): ReactNode {
  if (data?.whaleCount == null && data?.netFlow == null) return null;
  const trendColor =
    data.trend === "bullish" ? "text-green-400" :
    data.trend === "bearish" ? "text-red-400" : "text-muted-foreground";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {data.whaleCount != null && <StatCard label="Whales" value={String(data.whaleCount)} />}
        {data.netFlow && <StatCard label="Net Flow" value={data.netFlow} />}
        {data.volume24h && <StatCard label="24h Volume" value={data.volume24h} />}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {data.trend && <span className={`font-medium capitalize ${trendColor}`}>{data.trend}</span>}
        {data.topBuyer && <span className="text-muted-foreground">Top buyer: <span className="font-mono">{data.topBuyer}</span></span>}
        {data.topSeller && <span className="text-muted-foreground">Top seller: <span className="font-mono">{data.topSeller}</span></span>}
      </div>
    </div>
  );
}

function renderSlamai(data: any): ReactNode {
  if (data?.massTier == null && data?.iqScore == null) return null;
  const tierColor =
    data.massTier === "Whale" ? "text-blue-400" :
    data.massTier === "Dolphin" ? "text-cyan-400" : "text-muted-foreground";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Tier" value={data.massTier} />
        <StatCard label="IQ Score" value={`${data.iqScore}`} sub={`Grade: ${data.grade}`} />
        <StatCard label="Win Rate" value={`${((data.winRate ?? 0) * 100).toFixed(0)}%`} sub={`${data.tradeCount} trades`} />
        <StatCard label="PnL" value={data.pnl ?? "—"} />
      </div>
    </div>
  );
}

function renderMessariUnlocks(data: any): ReactNode {
  if (!data?.token && !data?.found) return null;
  const t = data.token;
  if (!t) return <div className="text-xs text-muted-foreground">Token not found in Messari catalog</div>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm font-medium">{t.symbol}</span>
        <span className="text-xs text-muted-foreground">{t.name}</span>
        {t.category && <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>}
        {t.sector && <Badge variant="outline" className="text-[10px]">{t.sector}</Badge>}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {t.genesisDate && <span>Genesis: {new Date(t.genesisDate).toLocaleDateString()}</span>}
        {t.projectedEndDate && <span>End: {new Date(t.projectedEndDate).toLocaleDateString()}</span>}
      </div>
      {t.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {t.tags.map((tag: string, i: number) => (
            <span key={i} className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function renderMessariAllocations(data: any): ReactNode {
  if (!data?.allocations?.length) return null;
  return (
    <div className="space-y-2">
      {data.assetSymbol && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{data.assetSymbol}</span>
          <span className="text-[10px] text-muted-foreground">Token Allocation</span>
          <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500" /> Unlocked
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500/30" /> Locked
          </div>
        </div>
      )}
      <div className="space-y-2">
        {data.allocations.map((a: any, i: number) => (
          <AllocationBar key={i} category={a.category} percentage={a.percentage} locked={a.locked} unlocked={a.unlocked} />
        ))}
      </div>
    </div>
  );
}

/* ─── Service name → renderer dispatch ─── */

const SERVICE_RENDERERS: Record<string, (data: any) => ReactNode> = {
  "Augur": renderAugur,
  "GenVox": renderGenvox,
  "QS Token Security": renderQsTokenSecurity,
  "QS Contract Audit": renderQsContractAudit,
  "QS Wallet Risk": renderQsWalletRisk,
  "QS Whale Activity": renderQsWhaleActivity,
  "SLAMai": renderSlamai,
  "Messari": renderMessariUnlocks,
  "Messari Allocations": renderMessariAllocations,
};

/* ─── Main cluster renderer ─── */

export function renderClusterOutput(data: any): ReactNode | null {
  if (!data?.serviceCalls?.length && !data?.summary) return null;

  return (
    <div className="p-3 space-y-3">
      {data.summary && (
        <p className="text-sm text-muted-foreground">{data.summary}</p>
      )}
      {data.serviceCalls?.map((call: any, i: number) => {
        const renderer = SERVICE_RENDERERS[call.serviceName];
        const rendered = renderer?.(call.data);

        return (
          <div key={i} className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
              <span className="text-xs font-medium">{call.serviceName}</span>
              {call.costMicroUsdc > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  ${(call.costMicroUsdc / 1_000_000).toFixed(4)}
                </span>
              )}
            </div>
            <div className="px-3 py-2">
              {rendered ?? (
                <div className="text-xs text-muted-foreground">
                  {call.data ? JSON.stringify(call.data, null, 2).slice(0, 200) : "No data"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
