"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { parseIntoSegments, InlineSegments } from "@/components/ai-elements/structured-markers";
import type { Report } from "@/lib/reports/report-store";

function parseReportActions(text: string): { cleanText: string } {
  // Strip [ACTION:...], [SUGGEST:...] markers — they're interactive chat elements, not for reports
  let cleanText = text
    .replace(/\[ACTION:[^\]]+\]/g, "")
    .replace(/\[SUGGEST:[^\]]+\]/g, "")
    .trim();

  // Strip agent narration before the actual analysis.
  // The real content starts at the first structured marker or bold section header.
  const contentStart = cleanText.search(/\[(METRIC|VERDICT|SCORE):|^\*\*[A-Z]/m);
  if (contentStart > 0) {
    // Only strip if the preamble looks like agent narration (contains phrases like "let me", "I'll", "I need to")
    const preamble = cleanText.slice(0, contentStart);
    if (/\b(let me|I'll|I need to|I see|I will|First,|Now let me)\b/i.test(preamble)) {
      cleanText = cleanText.slice(contentStart).trim();
    }
  }

  return { cleanText };
}

/** X (Twitter) logo */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Farcaster logo */
function FarcasterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} fill="currentColor">
      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H311.111V351.111H355.556L384.444 253.333H128.889Z" />
      <path d="M615.556 253.333L644.444 351.111H688.889V746.667C676.616 746.667 666.667 756.616 666.667 768.889V795.556H662.222C649.949 795.556 640 805.505 640 817.778V844.444H888.889V817.778C888.889 805.505 878.939 795.556 866.667 795.556H862.222V768.889C862.222 756.616 852.273 746.667 840 746.667H817.778V351.111H862.222L891.111 253.333H615.556Z" />
    </svg>
  );
}

function ShareBar({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/r/${reportId}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareX = () => {
    const text = encodeURIComponent("Check out this analysis from @ObolAI");
    const shareUrl = encodeURIComponent(url);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${shareUrl}`, "_blank");
  };

  const handleShareFarcaster = () => {
    const text = encodeURIComponent("Check out this analysis from Obol AI");
    const shareUrl = encodeURIComponent(url);
    window.open(`https://warpcast.com/~/compose?text=${text}&embeds[]=${shareUrl}`, "_blank");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleShareX}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
          bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <XIcon className="size-3.5" /> Share
      </button>
      <button
        onClick={handleShareFarcaster}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
          bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-colors"
      >
        <FarcasterIcon className="size-3.5" /> Farcaster
      </button>
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
          border border-border/60 text-foreground/80 hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function ReportViewer({ report }: { report: Report }) {
  const { cleanText } = parseReportActions(report.content);
  const segments = parseIntoSegments(cleanText);
  const date = new Date(report.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
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
          <ShareBar reportId={report.id} />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground mb-1">{report.title}</h1>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>

        <div className="prose-sm">
          <InlineSegments segments={segments} />
        </div>

        {/* Bottom share CTA */}
        <div className="mt-12 pt-6 border-t border-border/50 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Generated by Obol AI — an agent that pays for intelligence
            </p>
            <ShareBar reportId={report.id} />
          </div>
          <div className="flex justify-center">
            <a
              href="/chat"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
                bg-gradient-to-r from-blue-500/20 to-cyan-400/20
                border border-blue-500/30 hover:border-blue-500/50
                text-foreground hover:from-blue-500/30 hover:to-cyan-400/30
                transition-all duration-200"
            >
              Try Obol AI <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
