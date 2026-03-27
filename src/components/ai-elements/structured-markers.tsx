"use client";

import { cn } from "@/lib/utils";
import { Response } from "./response";

/* ─── Types ─── */

interface Metric {
  type: "metric";
  label: string;
  value: string;
  change?: string;
  iconUrl?: string;
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
  invert?: boolean;
}

type StructuredMarker = Metric | Verdict | Score;

type Segment =
  | { type: "text"; content: string }
  | { type: "markers"; items: StructuredMarker[] };

/* ─── Parser — produces interleaved text + marker segments ─── */

const MARKER_RE = /\[METRIC:([^|\]]+)\|([^|\]]+)(?:\|([^|\]]*))?\]|\[VERDICT:([^|\]]+)\|(\w+)\]|\[SCORE:([^|\]]+)\|([\d.]+)\/([\d.]+)(?:\|(\w+))?\]/g;

function parseMarkerMatch(match: RegExpExecArray): StructuredMarker {
  // METRIC
  if (match[1] != null) {
    return { type: "metric", label: match[1].trim(), value: match[2].trim(), change: match[3]?.trim() || undefined };
  }
  // VERDICT
  if (match[4] != null) {
    const c = match[5].trim().toLowerCase();
    const validColor = (c === "green" || c === "amber" || c === "red") ? c : "neutral";
    return { type: "verdict", text: match[4].trim(), color: validColor as Verdict["color"] };
  }
  // SCORE — normalize 0.x/1 to x/100
  const c = match[9]?.trim().toLowerCase();
  const label = match[6].trim();
  // Default: higher = better for sentiment scores; explicit flag overrides
  const invert = c === "green" || c === "positive" || /sentiment/i.test(label);
  let scoreVal = Number(match[7]);
  let scoreMax = Number(match[8]);
  if (scoreMax === 1 && scoreVal < 1) {
    scoreVal = Math.round(scoreVal * 100);
    scoreMax = 100;
  }
  return { type: "score", label: match[6].trim(), value: scoreVal, max: scoreMax, invert };
}

export function parseIntoSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let pendingMarkers: StructuredMarker[] = [];

  let match: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;

  // Punctuation/conjunctions between consecutive markers should not break grouping
  const GLUE_RE = /^[\s,;]*(?:and|or|&)?[\s,;]*$/i;

  while ((match = MARKER_RE.exec(text)) !== null) {
    const beforeText = text.slice(lastIndex, match.index);
    const trimmed = beforeText.trim();

    if (trimmed.length > 0 && pendingMarkers.length > 0) {
      if (GLUE_RE.test(trimmed)) {
        // Skip glue text — keep grouping markers together
      } else {
        // Real text — flush pending markers, then add the text
        segments.push({ type: "markers", items: pendingMarkers });
        pendingMarkers = [];
        segments.push({ type: "text", content: trimmed });
      }
    } else if (trimmed.length > 0) {
      segments.push({ type: "text", content: trimmed });
    }

    pendingMarkers.push(parseMarkerMatch(match));
    lastIndex = match.index + match[0].length;
  }

  // Flush remaining markers
  if (pendingMarkers.length > 0) {
    segments.push({ type: "markers", items: pendingMarkers });
  }

  // Any remaining text after the last marker
  const remaining = text.slice(lastIndex).trim();
  if (remaining.length > 0) {
    segments.push({ type: "text", content: remaining });
  }

  return segments;
}

/** Legacy API — still used when segments are overkill */
export function parseStructuredMarkers(text: string): {
  cleanText: string;
  markers: StructuredMarker[];
} {
  const segments = parseIntoSegments(text);
  const textParts: string[] = [];
  const markers: StructuredMarker[] = [];
  for (const seg of segments) {
    if (seg.type === "text") textParts.push(seg.content);
    else markers.push(...seg.items);
  }
  return { cleanText: textParts.join("\n\n"), markers };
}

/* ─── Components ─── */

function detectChangeColor(change?: string): "green" | "red" | "neutral" {
  if (!change) return "neutral";
  if (change.startsWith("+") || change.toLowerCase().includes("up") || change.toLowerCase().includes("stable")) return "green";
  if (change.startsWith("-") || change.toLowerCase().includes("down")) return "red";
  return "neutral";
}

const changeColors = {
  green: "text-green-400",
  red: "text-red-400",
  neutral: "text-muted-foreground",
};

export function MetricCard({ label, value, change, iconUrl }: Metric) {
  const color = detectChangeColor(change);
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        {iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="size-4 rounded-full" />
        )}
        <div className="text-xs font-semibold text-foreground/80 tracking-wide">{label}</div>
      </div>
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

export function ScoreGauge({ label, value, max, invert }: Score) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = invert
    ? (pct >= 60 ? "bg-green-500" : pct >= 30 ? "bg-amber-500" : "bg-red-500")
    : (pct <= 30 ? "bg-green-500" : pct <= 60 ? "bg-amber-500" : "bg-red-500");
  const textColor = invert
    ? (pct >= 60 ? "text-green-400" : pct >= 30 ? "text-amber-400" : "text-red-400")
    : (pct <= 30 ? "text-green-400" : pct <= 60 ? "text-amber-400" : "text-red-400");
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-foreground/80 tracking-wide">{label}</span>
        <span className={cn("text-sm font-mono font-semibold", textColor)}>{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── Render a group of markers ─── */

function MarkerGroup({ items, tokenIcons }: { items: StructuredMarker[]; tokenIcons?: Record<string, string> }) {
  const metrics = items.filter((m): m is Metric => m.type === "metric").map(m => {
    if (tokenIcons) {
      // Match label against icon map (e.g. "BTC" or "ETH CEX Net Flow" → "ETH")
      const symbol = m.label.split(/\s/)[0];
      const iconUrl = tokenIcons[symbol] ?? tokenIcons[m.label];
      if (iconUrl) return { ...m, iconUrl };
    }
    return m;
  });
  const scores = items.filter((m): m is Score => m.type === "score");
  const verdicts = items.filter((m): m is Verdict => m.type === "verdict");

  return (
    <div className="space-y-2 my-2">
      {metrics.length > 0 && (
        <div className={cn(
          "grid gap-2",
          metrics.length === 1 ? "grid-cols-1" :
          metrics.length === 2 ? "grid-cols-2" :
          metrics.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
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

/* ─── Inline segment renderer ─── */

export function InlineSegments({ segments, tokenIcons }: { segments: Segment[]; tokenIcons?: Record<string, string> }) {
  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <Response key={i}>{seg.content}</Response>
        ) : (
          <MarkerGroup key={i} items={seg.items} tokenIcons={tokenIcons} />
        )
      )}
    </>
  );
}

/** Legacy — render all markers in one block */
export function StructuredMarkers({ markers }: { markers: StructuredMarker[] }) {
  if (markers.length === 0) return null;
  return <MarkerGroup items={markers} />;
}
