import { ImageResponse } from "next/og";
import { ReportStore } from "@/lib/reports/report-store";

export const runtime = "edge";
export const alt = "Obol AI Daily Briefing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Metric {
  label: string;
  value: string;
  change?: string;
}

interface Verdict {
  text: string;
  color: string;
}

function extractMetrics(content: string): Metric[] {
  const metrics: Metric[] = [];
  const re = /\[METRIC:([^|\]]+)\|([^|\]]+)(?:\|([^|\]]*))?]/g;
  let match;
  while ((match = re.exec(content)) !== null && metrics.length < 3) {
    metrics.push({
      label: match[1].trim(),
      value: match[2].trim(),
      change: match[3]?.trim() || undefined,
    });
  }
  return metrics;
}

function extractVerdict(content: string): Verdict | null {
  const match = content.match(/\[VERDICT:([^|]+)\|(\w+)]/);
  if (!match) return null;
  return { text: match[1].trim(), color: match[2].trim().toLowerCase() };
}

const verdictColors: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)", text: "#4ade80" },
  amber: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24" },
  red: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)", text: "#f87171" },
};

export default async function OgImage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  const report = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? await ReportStore.getDigestByDate(date)
    : null;

  if (!report) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#09090b", color: "#a1a1aa", fontSize: 32 }}>
          Obol AI — Daily Briefing
        </div>
      ),
      { ...size },
    );
  }

  const displayDate = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const metrics = extractMetrics(report.content);
  const verdict = extractVerdict(report.content);
  const vc = verdict ? (verdictColors[verdict.color] ?? verdictColors.green) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#09090b",
          fontFamily: "sans-serif",
          padding: 60,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width="28" height="28" viewBox="0 0 32 32">
              <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#g)" strokeWidth="3.5" />
              <line x1="4" y1="16" x2="28" y2="16" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 18, color: "#71717a", letterSpacing: "0.05em" }}>obolai.app</span>
          </div>

          <div style={{ fontSize: 44, fontWeight: 700, color: "#fafafa", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {`Daily Briefing — ${displayDate}`}
          </div>
        </div>

        {metrics.length > 0 && (
          <div style={{ display: "flex", gap: 20, position: "relative" }}>
            {metrics.map((m, i) => {
              const changeColor = m.change?.startsWith("+") ? "#4ade80" : m.change?.startsWith("-") ? "#f87171" : "#a1a1aa";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "16px 24px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    minWidth: 200,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.08em" }}>{m.label}</span>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>{m.value}</span>
                  {m.change && <span style={{ fontSize: 16, color: changeColor, fontWeight: 600 }}>{m.change}</span>}
                </div>
              );
            })}
          </div>
        )}

        {verdict && vc ? (
          <div
            style={{
              display: "flex",
              padding: "16px 24px",
              borderRadius: 12,
              border: `1px solid ${vc.border}`,
              backgroundColor: vc.bg,
              color: vc.text,
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.4,
              position: "relative",
            }}
          >
            {verdict.text.length > 120 ? verdict.text.slice(0, 117) + "..." : verdict.text}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <span style={{ fontSize: 16, color: "#71717a" }}>AI-powered crypto market intelligence</span>
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
