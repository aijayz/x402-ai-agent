import Link from "next/link";
import { Shield, Fish, MessageCircle, TrendingUp, ArrowRight, Layers, DollarSign, ImageIcon, Globe, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

const clusters = [
  {
    icon: Shield, title: "DeFi Safety Analysis",
    description: "Rug pull detection, honeypot checks, and smart contract auditing from 3 independent sources",
    cost: "from $0.05",
    accent: "from-blue-500/20 to-cyan-400/20",
    border: "border-blue-500/20 hover:border-blue-500/40",
  },
  {
    icon: Fish, title: "Whale Tracking",
    description: "Smart money movements, wallet risk scoring, and large holder concentration analysis",
    cost: "from $0.01",
    accent: "from-purple-500/20 to-violet-400/20",
    border: "border-purple-500/20 hover:border-purple-500/40",
  },
  {
    icon: MessageCircle, title: "Social & Market Intelligence",
    description: "Sentiment analysis, contract risk scoring, and wallet reputation cross-referenced across services",
    cost: "from $0.13",
    accent: "from-amber-500/20 to-orange-400/20",
    border: "border-amber-500/20 hover:border-amber-500/40",
  },
  {
    icon: TrendingUp, title: "Market Trends",
    description: "Liquidity analysis, DEX pair safety metrics, and emerging narrative discovery",
    cost: "from $0.03",
    accent: "from-emerald-500/20 to-green-400/20",
    border: "border-emerald-500/20 hover:border-emerald-500/40",
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
          <Button asChild size="sm" className="shadow-lg shadow-primary/20">
            <Link href="/chat">
              Launch App <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Protocol badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/30 backdrop-blur-sm text-xs text-muted-foreground animate-in fade-in duration-1000">
            <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
            Built on x402 protocol
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
            AI agent that{" "}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              pays for intelligence
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ask anything about crypto. Obol AI orchestrates multiple paid services,
            handles USDC micropayments on Base automatically, and cross-references
            results from independent sources.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-lg shadow-primary/20 px-8">
              <Link href="/chat">
                Start chatting <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">2 free tool calls, no wallet needed</span>
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
              Each cluster orchestrates 3 independent services for cross-referenced intelligence
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {clusters.map((f, i) => (
              <div
                key={f.title}
                className={`group relative rounded-xl border ${f.border} p-5 space-y-3 transition-all duration-300 hover:translate-y-[-2px] animate-in fade-in slide-in-from-bottom-3 fill-mode-both`}
                style={{ animationDelay: `${150 + i * 100}ms`, animationDuration: "500ms" }}
              >
                {/* Card gradient background */}
                <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
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
              Paid MCP tools
            </h2>
            <p className="text-sm text-muted-foreground">
              Individual tools paid per-call via x402 micropayments
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
            <div className="rounded-xl border border-border/50 p-6 space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both" style={{ animationDelay: "100ms" }}>
              <h3 className="font-semibold text-foreground">Free</h3>
              <p className="text-sm text-muted-foreground">
                2 free tool calls. Prices, summaries, images, and basic analysis.
              </p>
              <p className="text-2xl font-bold text-foreground">$0</p>
            </div>
            <div
              className="relative rounded-xl border border-blue-500/30 p-6 space-y-3 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both"
              style={{ animationDelay: "200ms" }}
            >
              {/* Highlight glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.08] to-purple-500/[0.08]" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">Credits</h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Connect wallet, deposit USDC. Access all research clusters and premium tools.
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
            <span>Built with the x402 protocol on</span>
            <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-blue-400 transition-colors">Base</a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <div className="w-1 h-1 rounded-full bg-green-500" />
            All systems operational
          </div>
        </div>
      </footer>
    </div>
  );
}
