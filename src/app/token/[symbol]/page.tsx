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

function ScoreCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export default async function TokenPage({ params }: Props) {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());
  if (!snap) notFound();

  const d = snap.data;
  const changeColor = d.change24h >= 0 ? "text-green-400" : "text-red-400";
  const changeSign = d.change24h >= 0 ? "+" : "";
  const priceStr =
    d.price >= 1
      ? d.price.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : `$${d.price.toPrecision(4)}`;
  const mcapStr = d.marketCap > 0 ? `$${(d.marketCap / 1e9).toFixed(1)}B` : "N/A";

  const securityScore = d.security?.score;
  const whaleNet = d.whaleFlow?.netFlowUsd;
  const sentimentScore = d.sentiment?.score;

  const updatedDate = new Date(snap.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[680px] mx-auto px-6 py-3 flex items-center justify-between">
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
              <circle
                cx="16"
                cy="16"
                r="9.5"
                fill="none"
                stroke="url(#g)"
                strokeWidth="3.5"
              />
              <line
                x1="4"
                y1="16"
                x2="28"
                y2="16"
                stroke="url(#g)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            Obol AI
          </a>
        </div>
      </header>

      <main className="max-w-[680px] mx-auto px-6 pt-10 pb-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {d.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.iconUrl}
                alt={snap.symbol}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <h1 className="text-2xl font-semibold">
              {d.name} ({snap.symbol})
            </h1>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{priceStr}</span>
            <span className={`text-lg font-medium ${changeColor}`}>
              {changeSign}
              {d.change24h.toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground">MCap: {mcapStr}</span>
          </div>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          <ScoreCard
            label="Security"
            value={securityScore != null ? `${securityScore}/100` : "N/A"}
            sub={
              securityScore != null
                ? securityScore >= 70
                  ? "Verified"
                  : "Review"
                : "Pending"
            }
            color={
              securityScore != null
                ? securityScore >= 70
                  ? "text-green-400"
                  : "text-amber-400"
                : "text-muted-foreground"
            }
          />
          <ScoreCard
            label="Whale Flow (7d)"
            value={
              whaleNet != null ? `$${(Math.abs(whaleNet) / 1e6).toFixed(1)}M` : "N/A"
            }
            sub={
              whaleNet != null
                ? whaleNet >= 0
                  ? "Net inflow"
                  : "Net outflow"
                : "No data"
            }
            color={
              whaleNet != null
                ? whaleNet >= 0
                  ? "text-green-400"
                  : "text-red-400"
                : "text-muted-foreground"
            }
          />
          <ScoreCard
            label="Sentiment"
            value={sentimentScore != null ? `${sentimentScore}/100` : "N/A"}
            sub={d.sentiment?.label ?? "No data"}
            color={
              sentimentScore != null
                ? sentimentScore >= 60
                  ? "text-green-400"
                  : sentimentScore >= 40
                    ? "text-amber-400"
                    : "text-red-400"
                : "text-muted-foreground"
            }
          />
        </div>

        {/* Intelligence bullets */}
        {d.intelligence && d.intelligence.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Recent Intelligence
            </h2>
            <ul className="space-y-2">
              {d.intelligence.map((item, i) => (
                <li
                  key={i}
                  className="text-sm text-foreground/80 flex items-start gap-2"
                >
                  <span className="text-muted-foreground mt-0.5">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 text-center space-y-3">
          <p className="text-sm text-foreground/80">Want deeper analysis?</p>
          <Link
            href={`/chat?q=Tell me about ${snap.symbol}`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
              bg-gradient-to-r from-blue-500/20 to-cyan-400/20
              border border-blue-500/30 hover:border-blue-500/50
              text-foreground hover:from-blue-500/30 hover:to-cyan-400/30
              transition-all duration-200"
          >
            Ask Obol about {snap.symbol}
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-border/40 text-center">
          <p className="text-xs text-muted-foreground">
            Last updated {updatedDate} | Data via x402 paid intelligence network
          </p>
        </div>
      </main>
    </div>
  );
}
