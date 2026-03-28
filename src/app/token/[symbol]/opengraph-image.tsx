import { ImageResponse } from "next/og";
import { TokenSnapshotStore } from "@/lib/token-pages/store";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Obol AI Token Intelligence";

export default async function OgImage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());

  if (!snap) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#09090b", color: "#a1a1aa", alignItems: "center", justifyContent: "center", fontSize: 32, fontFamily: "sans-serif" }}>
          Token not found
        </div>
      ),
      { ...size }
    );
  }

  const d = snap.data;
  const changeSign = d.change24h >= 0 ? "+" : "";
  const changeColor = d.change24h >= 0 ? "#4ade80" : "#f87171";
  const priceStr = d.price >= 1
    ? `$${d.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${d.price.toPrecision(3)}`;

  const cards: Array<{ label: string; value: string; color: string }> = [];
  if (d.security?.score != null) {
    cards.push({
      label: "Security",
      value: `${d.security.score}/100`,
      color: d.security.score >= 70 ? "#4ade80" : "#fbbf24",
    });
  }
  if (d.whaleFlow) {
    cards.push({
      label: "Whale Flow",
      value: `$${(Math.abs(d.whaleFlow.netFlowUsd) / 1e6).toFixed(0)}M`,
      color: d.whaleFlow.netFlowUsd >= 0 ? "#4ade80" : "#f87171",
    });
  }
  if (d.sentiment?.score != null) {
    cards.push({
      label: "Sentiment",
      value: `${d.sentiment.score}/100`,
      color: d.sentiment.score >= 60 ? "#4ade80" : d.sentiment.score >= 40 ? "#fbbf24" : "#f87171",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#09090b",
          color: "#e5e5e5",
          padding: "60px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Grid pattern overlay */}
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

        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "32px" }}>
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
          <span style={{ fontSize: 18, color: "#71717a", letterSpacing: "0.05em" }}>obolai.xyz</span>
        </div>

        {/* Token name + symbol */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
            {`${d.name} (${snap.symbol})`}
          </span>
        </div>

        {/* Price + 24h change */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "48px" }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: "#ffffff" }}>{priceStr}</span>
          <span style={{ fontSize: 32, fontWeight: 600, color: changeColor }}>
            {`${changeSign}${d.change24h.toFixed(1)}%`}
          </span>
        </div>

        {/* Score cards */}
        {cards.length > 0 && (
          <div style={{ display: "flex", gap: "24px", marginBottom: "auto" }}>
            {cards.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "24px 32px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.03)",
                  minWidth: "200px",
                }}
              >
                <span style={{ fontSize: 16, color: "#a3a3a3", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</span>
                <span style={{ fontSize: 36, fontWeight: 700, color: c.color }}>{c.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spacer when no cards */}
        {cards.length === 0 && <div style={{ display: "flex", flex: 1 }} />}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 20, color: "#525252" }}>obolai.xyz/token/{snap.symbol}</span>
          <span style={{ fontSize: 20, color: "#525252" }}>Powered by x402</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
