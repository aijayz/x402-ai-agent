import Link from "next/link";
import { Shield, Fish, MessageCircle, TrendingUp, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Shield, title: "DeFi Safety Analysis",
    description: "Rug pull detection, contract auditing, and token risk scoring",
    cost: "from $0.12",
  },
  {
    icon: Fish, title: "Whale Tracking",
    description: "Smart money movements and wallet profiling",
    cost: "from $0.01",
  },
  {
    icon: MessageCircle, title: "Social Sentiment",
    description: "Twitter and Farcaster narrative analysis",
    cost: "from $0.13",
  },
  {
    icon: TrendingUp, title: "Market Intelligence",
    description: "Trending narratives and emerging token discovery",
    cost: "from $0.03",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 p-[1.5px]">
              <div className="w-full h-full rounded-[6px] bg-background flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <span className="text-sm font-bold text-foreground">x402</span>
          </div>
          <Button asChild size="sm">
            <Link href="/chat">
              Launch App <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            AI agent that pays for intelligence
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Ask anything about crypto. The agent orchestrates paid research services,
            handles USDC payments on Base automatically, and synthesizes answers from
            multiple sources.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="/chat">
                Start chatting <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer">
                Learn about x402
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
            Research clusters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-lg border border-border p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <f.icon className="size-5 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">{f.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{f.description}</p>
                <p className="text-xs text-muted-foreground/70">{f.cost}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
            Simple pricing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-6 space-y-3">
              <h3 className="font-semibold text-foreground">Free</h3>
              <p className="text-sm text-muted-foreground">
                2 free tool calls. Prices, summaries, images, and basic analysis.
              </p>
              <p className="text-2xl font-bold text-foreground">$0</p>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6 space-y-3">
              <h3 className="font-semibold text-foreground">Credits</h3>
              <p className="text-sm text-muted-foreground">
                Connect wallet, deposit USDC. Access all research clusters and premium tools.
              </p>
              <p className="text-2xl font-bold text-foreground">Pay as you go</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>Built with the x402 protocol on Base</span>
          <div className="flex items-center gap-4">
            <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">x402.org</a>
            <a href="https://github.com/aijayz/x402-ai-agent" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
            <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Base</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
