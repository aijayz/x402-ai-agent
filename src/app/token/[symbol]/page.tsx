import { notFound } from "next/navigation";
import Link from "next/link";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import type { Metadata } from "next";

export const revalidate = 86400; // ISR: revalidate once per day

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());
  if (!snap) return { title: "Token Not Found -- Obol AI" };

  const d = snap.data;
  const title = `${d.name} (${snap.symbol}) On-Chain Intelligence -- Obol AI`;
  const description = `${snap.symbol} at $${d.price.toLocaleString()} (${d.change24h >= 0 ? "+" : ""}${d.change24h.toFixed(1)}%). Whale flows, security score, sentiment analysis. Updated daily.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "article", siteName: "Obol AI" },
    twitter: { card: "summary_large_image", title },
  };
}

// ── SVG Ring Gauge ─────────────────────────────────────────────

function RingGauge({
  score,
  max = 100,
  size = 80,
  strokeWidth = 6,
  color,
  trackColor = "rgba(255,255,255,0.06)",
}: {
  score: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / max, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function deriveSentimentLabel(score: number | null | undefined): string {
  if (score == null) return "No data";
  if (score >= 70) return "Bullish";
  if (score >= 55) return "Leaning bullish";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Leaning bearish";
  return "Bearish";
}

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

// ── Page ────────────────────────────────────────────────────────

export default async function TokenPage({ params }: Props) {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());
  if (!snap) notFound();

  const d = snap.data;
  const changeColor = d.change24h >= 0 ? "text-emerald-400" : "text-red-400";
  const changeSign = d.change24h >= 0 ? "+" : "";
  const priceStr =
    d.price >= 1
      ? d.price.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : `$${d.price.toPrecision(4)}`;
  const mcapStr = d.marketCap > 0 ? `$${(d.marketCap / 1e9).toFixed(1)}B` : "—";

  const securityScore = d.security?.score ?? null;
  const securityDetails = d.security?.details ?? null;
  const isBlueChip = securityDetails?.includes("Blue-chip") ?? false;

  const whaleFlow = d.whaleFlow;
  const hasExchangeSplit = whaleFlow?.hasExchangeSplit !== false;
  const whaleNet = whaleFlow?.netFlowUsd ?? null;
  const whaleVolume = whaleFlow?.totalVolumeUsd ?? null;
  const largeTxCount = whaleFlow?.largeTxCount ?? 0;

  const sentimentScore = d.sentiment?.score ?? null;
  const sentimentLabel = d.sentiment?.label || deriveSentimentLabel(sentimentScore);
  const sentimentSummary = d.sentiment?.summary ?? null;

  const updatedDate = new Date(snap.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Color computation
  const secColor = securityScore != null
    ? securityScore >= 70 ? "#34d399" : securityScore >= 40 ? "#fbbf24" : "#f87171"
    : "#525252";
  const sentColor = sentimentScore != null
    ? sentimentScore >= 60 ? "#34d399" : sentimentScore >= 40 ? "#fbbf24" : "#f87171"
    : "#525252";

  // Whale flow display
  const whaleHasData = (hasExchangeSplit && whaleNet != null) || (whaleVolume != null && whaleVolume > 0);
  const whaleValueStr = hasExchangeSplit && whaleNet != null
    ? formatUsd(whaleNet)
    : whaleVolume != null && whaleVolume > 0
      ? formatUsd(whaleVolume)
      : "—";
  const whaleIsNegligible = hasExchangeSplit && whaleNet != null && Math.abs(whaleNet) < 1_000_000;
  const whaleDirection = hasExchangeSplit && whaleNet != null
    ? whaleIsNegligible ? "neutral" : whaleNet >= 0 ? "inflow" : "outflow"
    : "volume";
  const whaleColor = whaleDirection === "inflow" ? "#34d399"
    : whaleDirection === "outflow" ? "#f87171"
    : whaleDirection === "volume" ? "#60a5fa"
    : "#a3a3a3";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[740px] mx-auto px-6 py-3 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 32 32">
              <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#g)" strokeWidth="3.5" />
              <line x1="4" y1="16" x2="28" y2="16" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Obol AI
          </a>
          <Link
            href={`/chat?q=Tell me about ${snap.symbol}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Ask Obol →
          </Link>
        </div>
      </header>

      <main className="max-w-[740px] mx-auto px-6 pt-10 pb-16">
        {/* ── Token header ── */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            {d.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.iconUrl}
                alt={snap.symbol}
                width={36}
                height={36}
                className="rounded-full ring-1 ring-white/10"
              />
            )}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {d.name}{" "}
                <span className="text-muted-foreground font-normal">{snap.symbol}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-4xl font-bold tracking-tight">{priceStr}</span>
            <span className={`text-lg font-semibold ${changeColor}`}>
              {changeSign}{d.change24h.toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground/70">MCap {mcapStr}</span>
          </div>
        </div>

        {/* ── Score cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">

          {/* Security */}
          <div className="rounded-xl border border-border/40 bg-gradient-to-br from-white/[0.03] to-transparent p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-medium mb-1">Security</p>
                <p className="text-2xl font-bold" style={{ color: secColor }}>
                  {securityScore != null ? securityScore : "—"}
                  {securityScore != null && (
                    <span className="text-sm font-normal text-muted-foreground/50">/100</span>
                  )}
                </p>
              </div>
              {securityScore != null && (
                <div className="relative">
                  <RingGauge score={securityScore} color={secColor} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={secColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {securityScore != null
                ? isBlueChip
                  ? "Blue-chip asset"
                  : securityScore >= 70 ? "Verified secure" : "Needs review"
                : "Pending analysis"}
            </p>
          </div>

          {/* Whale Flow */}
          <div className="rounded-xl border border-border/40 bg-gradient-to-br from-white/[0.03] to-transparent p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-medium mb-1">
                  {hasExchangeSplit ? "Whale Flow" : "Whale Vol."}{" "}
                  <span className="normal-case tracking-normal text-muted-foreground/40">7d</span>
                </p>
                <p className="text-2xl font-bold" style={{ color: whaleHasData ? whaleColor : undefined }}>
                  {whaleValueStr}
                </p>
              </div>
              {whaleHasData && (
                <div
                  className="w-[80px] h-[80px] rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${whaleColor}10` }}
                >
                  {whaleDirection === "inflow" ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={whaleColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                    </svg>
                  ) : whaleDirection === "outflow" ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={whaleColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
                    </svg>
                  ) : whaleDirection === "volume" ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={whaleColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="12" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="12" rx="1" /><rect x="17" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={whaleColor} strokeWidth="2" strokeLinecap="round">
                      <path d="M5 12h14" />
                    </svg>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {whaleDirection === "inflow" ? "Net accumulation"
                : whaleDirection === "outflow" ? "Net distribution"
                : whaleDirection === "neutral" ? "Negligible flow"
                : whaleHasData ? `${largeTxCount} large transactions` : "No data available"}
              {whaleHasData && largeTxCount > 0 && whaleDirection !== "volume" && (
                <span className="text-muted-foreground/50"> · {largeTxCount} large txns</span>
              )}
            </p>
          </div>

          {/* Sentiment */}
          <div className="rounded-xl border border-border/40 bg-gradient-to-br from-white/[0.03] to-transparent p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-medium mb-1">Sentiment</p>
                <p className="text-2xl font-bold" style={{ color: sentColor }}>
                  {sentimentScore != null ? sentimentScore : "—"}
                  {sentimentScore != null && (
                    <span className="text-sm font-normal text-muted-foreground/50">/100</span>
                  )}
                </p>
              </div>
              {sentimentScore != null && (
                <div className="relative">
                  <RingGauge score={sentimentScore} color={sentColor} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-semibold" style={{ color: sentColor }}>
                      {sentimentLabel.slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {sentimentLabel}
            </p>
          </div>
        </div>

        {/* ── Sentiment summary ── */}
        {sentimentSummary && (
          <div className="mb-8 rounded-lg border border-border/30 bg-white/[0.02] px-5 py-4">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-2">Market Mood</p>
            <p className="text-sm text-foreground/70 leading-relaxed">{sentimentSummary}</p>
          </div>
        )}

        {/* ── Intelligence bullets ── */}
        {d.intelligence && d.intelligence.length > 0 && (
          <div className="mb-8">
            <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-3">
              Intelligence
            </h2>
            <ul className="space-y-2">
              {d.intelligence.map((item, i) => (
                <li key={i} className="text-sm text-foreground/70 flex items-start gap-2.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400/60 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── CTA ── */}
        <div className="rounded-xl border border-border/30 bg-gradient-to-r from-blue-500/[0.06] to-violet-500/[0.06] p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">Want deeper on-chain intelligence?</p>
          <Link
            href={`/chat?q=Give me a full analysis of ${snap.symbol}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium
              bg-gradient-to-r from-blue-500 to-violet-500
              text-white hover:from-blue-400 hover:to-violet-400
              shadow-lg shadow-blue-500/20
              transition-all duration-200"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Ask Obol about {snap.symbol}
          </Link>
        </div>

        {/* ── Footer ── */}
        <div className="mt-14 pt-5 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground/50">
          <span>Updated {updatedDate}</span>
          <span>Data via x402 paid intelligence</span>
        </div>
      </main>
    </div>
  );
}
