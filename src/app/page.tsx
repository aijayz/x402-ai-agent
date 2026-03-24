import Link from "next/link";
import { Shield, Fish, MessageCircle, TrendingUp, ArrowRight, Layers, DollarSign, ImageIcon, Globe, FileSearch, Wallet, Zap, Search, CircleDollarSign, GitBranch, Mail, Github } from "lucide-react";
import { Button } from "@/components/ui/button";

const clusters = [
  {
    icon: Shield, title: "DeFi Safety Analysis",
    description: "Rug pull detection, honeypot checks, and smart contract auditing from 3 independent sources",
    cost: "from $0.05",
    border: "border-blue-500/20 hover:border-blue-500/50",
    glow: "hover:shadow-[inset_0_0_80px_rgba(59,130,246,0.10)]",
  },
  {
    icon: Fish, title: "Whale Tracking",
    description: "Smart money movements, wallet risk scoring, and large holder concentration analysis",
    cost: "from $0.01",
    border: "border-purple-500/20 hover:border-purple-500/50",
    glow: "hover:shadow-[inset_0_0_80px_rgba(168,85,247,0.10)]",
  },
  {
    icon: MessageCircle, title: "Social & Market Intelligence",
    description: "Sentiment analysis, contract risk scoring, and wallet reputation cross-referenced across services",
    cost: "from $0.13",
    border: "border-amber-500/20 hover:border-amber-500/50",
    glow: "hover:shadow-[inset_0_0_80px_rgba(245,158,11,0.10)]",
  },
  {
    icon: TrendingUp, title: "Market Trends",
    description: "Liquidity analysis, DEX pair safety metrics, and emerging narrative discovery",
    cost: "from $0.03",
    border: "border-emerald-500/20 hover:border-emerald-500/50",
    glow: "hover:shadow-[inset_0_0_80px_rgba(16,185,129,0.10)]",
  },
  {
    icon: Wallet, title: "Wallet Portfolio Intelligence",
    description: "Trade history, smart money tier (Whale/Dolphin/Fish), IQ score, and on-chain risk profile",
    cost: "from $0.01",
    border: "border-cyan-500/20 hover:border-cyan-500/50",
    glow: "hover:shadow-[inset_0_0_80px_rgba(6,182,212,0.10)]",
  },
  {
    icon: Zap, title: "Token Alpha Screening",
    description: "Security score, top holder quality, and upcoming unlock schedules to surface early alpha",
    cost: "from $0.01",
    border: "border-rose-500/20 hover:border-rose-500/50",
    glow: "hover:shadow-[inset_0_0_80px_rgba(244,63,94,0.10)]",
  },
];

const tools = [
  { icon: DollarSign, title: "Crypto Prices", cost: "$0.01", description: "Live prices, 24h change, market cap" },
  { icon: Layers, title: "Wallet Profile", cost: "$0.02", description: "On-chain balances and activity" },
  { icon: Globe, title: "URL Summarizer", cost: "$0.03", description: "Fetch and summarize any webpage" },
  { icon: FileSearch, title: "Contract Analysis", cost: "$0.03", description: "Verified smart contract analysis" },
  { icon: ImageIcon, title: "Image Generation", cost: "$0.05", description: "AI-powered image generation" },
];

export default function LandingPage() {
  return (
    <div className="min-h-full bg-background relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-500/[0.07] blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/[0.05] blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] rounded-full bg-cyan-500/[0.04] blur-[100px]" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative border-b border-border/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-2.5">
            <svg className="w-8 h-8" viewBox="0 0 32 32">
              <defs>
                <linearGradient id="obol-g" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6"/>
                  <stop offset="100%" stopColor="#8b5cf6"/>
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="7" fill="#09090b"/>
              <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#obol-g)" strokeWidth="3.5"/>
              <line x1="4" y1="16" x2="28" y2="16" stroke="url(#obol-g)" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-bold text-foreground">Obol AI</span>
          </div>
          <Link
            href="/chat"
            className="group relative inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white
              bg-gradient-to-r from-blue-500 to-purple-500
              shadow-lg shadow-blue-500/20
              hover:shadow-blue-500/30 hover:brightness-110
              transition-all duration-300"
          >
            Launch App
            <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Value badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/30 backdrop-blur-sm text-xs text-muted-foreground animate-in fade-in duration-1000">
            <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
            No subscription — pay only for what you use
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
            AI agent that{" "}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              pays for intelligence
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ask anything about crypto. Obol orchestrates multiple paid services,
            handles USDC micropayments automatically, and cross-references
            results from independent sources — no subscription required.
          </p>
          <div className="pt-6 flex flex-col items-center gap-4">
            <Link
              href="/chat"
              className="group relative inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold text-white
                bg-gradient-to-r from-blue-500 via-blue-400 to-purple-500
                shadow-[0_0_32px_rgba(59,130,246,0.3)]
                hover:shadow-[0_0_48px_rgba(59,130,246,0.45)]
                hover:brightness-110
                transition-all duration-500
                before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent
                before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700
                before:overflow-hidden overflow-hidden"
            >
              Start chatting
              <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform duration-300" />
            </Link>
            <span className="text-sm text-muted-foreground/70">2 free tool calls — no wallet needed</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative py-16 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-2xl font-semibold text-foreground mb-2">How it works</h2>
            <p className="text-sm text-muted-foreground">Three steps from question to cross-referenced answer</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                step: "1",
                title: "Ask anything",
                description: "Type a question about any token, wallet, or DeFi protocol. No setup needed.",
              },
              {
                icon: GitBranch,
                step: "2",
                title: "AI orchestrates services",
                description: "Obol picks the right combination of independent research services and pays them automatically.",
              },
              {
                icon: Shield,
                step: "3",
                title: "Cross-referenced results",
                description: "Get answers verified across multiple sources — not just one provider's opinion.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className="relative rounded-xl border border-border/50 bg-zinc-900/80 p-6 text-center space-y-3 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
                style={{ animationDelay: `${100 + i * 100}ms`, animationDuration: "500ms" }}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 mx-auto">
                  <item.icon className="size-4 text-blue-400" />
                </div>
                <h3 className="font-medium text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Research Clusters */}
      <section className="relative py-16 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Research clusters
            </h2>
            <p className="text-sm text-muted-foreground">
              Each cluster orchestrates multiple independent services for cross-referenced intelligence
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {clusters.map((f, i) => (
              <div
                key={f.title}
                className={`group relative rounded-xl border ${f.border} ${f.glow} bg-zinc-900/80 p-5 space-y-3 transition-all duration-300 hover:translate-y-[-2px] animate-in fade-in slide-in-from-bottom-3 fill-mode-both`}
                style={{ animationDelay: `${150 + i * 100}ms`, animationDuration: "500ms" }}
              >
                <div className="relative">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50 border border-border/50">
                      <f.icon className="size-4 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium text-foreground">{f.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{f.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs font-mono text-muted-foreground/60">{f.cost}</span>
                    <span className="text-xs text-muted-foreground/40">3 services</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MCP Tools */}
      <section className="relative py-16 px-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Quick tools
            </h2>
            <p className="text-sm text-muted-foreground">
              Individual tools paid per-call — from $0.01 per query
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {tools.map((t, i) => (
              <div
                key={t.title}
                className="group rounded-xl border border-border/50 hover:border-border p-4 space-y-2 text-center transition-all duration-300 hover:translate-y-[-2px] hover:bg-muted/20 animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                style={{ animationDelay: `${100 + i * 80}ms`, animationDuration: "400ms" }}
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/40 border border-border/40 mx-auto group-hover:bg-muted/60 transition-colors">
                  <t.icon className="size-4 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium text-foreground">{t.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                <p className="text-xs font-mono text-blue-400">{t.cost}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative py-16 px-6 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
            Simple pricing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border/50 bg-zinc-900/80 p-6 space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both" style={{ animationDelay: "100ms" }}>
              <h3 className="font-semibold text-foreground">Free</h3>
              <p className="text-sm text-muted-foreground">
                2 free tool calls — no wallet needed. Connect a wallet to get up to $0.50 in free credits.
              </p>
              <p className="text-2xl font-bold text-foreground">$0</p>
            </div>
            <div
              className="relative rounded-xl border border-blue-500/30 p-6 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
              style={{ animationDelay: "200ms", background: "linear-gradient(to bottom right, rgba(59,130,246,0.08), rgba(168,85,247,0.08)) no-repeat, rgb(24,24,27)" }}
            >
              <div className="relative space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">Credits</h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Deposit USDC from Base, Ethereum, Arbitrum, or Optimism. Access all research clusters and premium tools.
                </p>
                <p className="text-2xl font-bold text-foreground mt-3">Pay as you go</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-blue-400 transition-colors">x402</a>
            <span>on</span>
            <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-blue-400 transition-colors">Base</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/aijayz/x402-ai-agent" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
              <Github className="size-3.5" />
              GitHub
            </a>
            <a href="mailto:support@obolai.xyz" className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
              <Mail className="size-3" />
              support@obolai.xyz
            </a>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
              <div className="w-1 h-1 rounded-full bg-green-500" />
              All systems operational
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
