"use client";

import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface Metric {
  type: "metric";
  label: string;
  value: string;
  change?: string;
}

interface Verdict {
  type: "verdict";
  text: string;
  color: "green" | "amber" | "red" | "neutral";
}

interface Score {
  type: "score";
  label: string;
  value: number;
  max: number;
}

type StructuredMarker = Metric | Verdict | Score;

/* ─── Parser ─── */

const METRIC_RE = /\[METRIC:([^|\]]+)\|([^|\]]+)(?:\|([^|\]]*))?\]/g;
const VERDICT_RE = /\[VERDICT:([^|\]]+)\|(\w+)\]/g;
const SCORE_RE = /\[SCORE:([^|\]]+)\|(\d+)\/(\d+)\]/g;

export function parseStructuredMarkers(text: string): {
  cleanText: string;
  markers: StructuredMarker[];
} {
  const markers: StructuredMarker[] = [];

  let cleanText = text.replace(METRIC_RE, (_, label, value, change) => {
    markers.push({ type: "metric", label: label.trim(), value: value.trim(), change: change?.trim() || undefined });
    return "";
  });

  cleanText = cleanText.replace(VERDICT_RE, (_, verdictText, color) => {
    const c = color.trim().toLowerCase();
    const validColor = (c === "green" || c === "amber" || c === "red") ? c : "neutral";
    markers.push({ type: "verdict", text: verdictText.trim(), color: validColor as Verdict["color"] });
    return "";
  });

  cleanText = cleanText.replace(SCORE_RE, (_, label, value, max) => {
    markers.push({ type: "score", label: label.trim(), value: Number(value), max: Number(max) });
    return "";
  });

  return { cleanText, markers };
}

/* ─── Components ─── */

function detectChangeColor(change?: string): "green" | "red" | "neutral" {
  if (!change) return "neutral";
  if (change.startsWith("+") || change.toLowerCase().includes("up")) return "green";
  if (change.startsWith("-") || change.toLowerCase().includes("down")) return "red";
  return "neutral";
}

const changeColors = {
  green: "text-green-400",
  red: "text-red-400",
  neutral: "text-muted-foreground",
};

export function MetricCard({ label, value, change }: Metric) {
  const color = detectChangeColor(change);
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold truncate">{value}</div>
      {change && (
        <div className={cn("text-xs font-medium font-mono", changeColors[color])}>{change}</div>
      )}
    </div>
  );
}

const verdictColors = {
  green: "border-green-500/30 bg-green-500/10 text-green-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  red: "border-red-500/30 bg-red-500/10 text-red-300",
  neutral: "border-border bg-muted/30 text-foreground",
};

export function VerdictBanner({ text, color }: Verdict) {
  return (
    <div className={cn("rounded-lg border px-4 py-2.5 text-sm font-medium", verdictColors[color])}>
      {text}
    </div>
  );
}

export function ScoreGauge({ label, value, max }: Score) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color =
    pct <= 30 ? "bg-green-500" : pct <= 60 ? "bg-amber-500" : "bg-red-500";
  const textColor =
    pct <= 30 ? "text-green-400" : pct <= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-mono font-semibold", textColor)}>{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── Render all markers ─── */

export function StructuredMarkers({ markers }: { markers: StructuredMarker[] }) {
  if (markers.length === 0) return null;

  const metrics = markers.filter((m): m is Metric => m.type === "metric");
  const scores = markers.filter((m): m is Score => m.type === "score");
  const verdicts = markers.filter((m): m is Verdict => m.type === "verdict");

  return (
    <div className="space-y-3 my-3">
      {metrics.length > 0 && (
        <div className={cn(
          "grid gap-2",
          metrics.length === 1 ? "grid-cols-1" :
          metrics.length === 2 ? "grid-cols-2" :
          "grid-cols-2 sm:grid-cols-3"
        )}>
          {metrics.map((m, i) => <MetricCard key={i} {...m} />)}
        </div>
      )}
      {scores.length > 0 && (
        <div className={cn(
          "grid gap-2",
          scores.length === 1 ? "grid-cols-1" : "grid-cols-2"
        )}>
          {scores.map((s, i) => <ScoreGauge key={i} {...s} />)}
        </div>
      )}
      {verdicts.map((v, i) => <VerdictBanner key={i} {...v} />)}
    </div>
  );
}
