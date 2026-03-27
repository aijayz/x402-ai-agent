"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Copy, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { parseIntoSegments, InlineSegments } from "@/components/ai-elements/structured-markers";
import type { Report } from "@/lib/reports/report-store";

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

function ShareBar({ digestDate }: { digestDate: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/digest/${digestDate}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareX = () => {
    const text = encodeURIComponent("Today's crypto briefing from @ai_obol");
    const shareUrl = encodeURIComponent(url);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${shareUrl}`, "_blank");
  };

  const handleShareFarcaster = () => {
    const text = encodeURIComponent("Today's crypto briefing from Obol AI");
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

function getAdjacentDate(dateStr: string, offset: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Make 0x addresses in rendered HTML copiable with click */
function useAddressLinks(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ADDRESS_RE = /0x[a-fA-F0-9]{4,}(?:\.\.\.[a-fA-F0-9]+)?/g;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const replacements: { node: Text; frag: DocumentFragment }[] = [];

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const text = textNode.textContent ?? "";
      if (!ADDRESS_RE.test(text)) continue;
      ADDRESS_RE.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match: RegExpExecArray | null;
      while ((match = ADDRESS_RE.exec(text)) !== null) {
        if (match.index > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
        }
        const addr = match[0];
        const btn = document.createElement("button");
        btn.className = "font-mono text-blue-400/80 hover:text-blue-300 cursor-pointer transition-colors";
        btn.textContent = addr;
        btn.title = "Click to copy";
        btn.addEventListener("click", async () => {
          await navigator.clipboard.writeText(addr);
          const orig = btn.textContent;
          btn.textContent = "Copied!";
          btn.classList.add("text-green-400");
          setTimeout(() => { btn.textContent = orig; btn.classList.remove("text-green-400"); }, 1500);
        });
        frag.appendChild(btn);
        lastIdx = match.index + addr.length;
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }
      replacements.push({ node: textNode, frag });
    }

    for (const { node, frag } of replacements) {
      node.parentNode?.replaceChild(frag, node);
    }
  }, [ref]);
}

export function DigestViewer({ report }: { report: Report }) {
  const segments = parseIntoSegments(report.content);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAddressLinks(bodyRef);
  const tokenIcons = (report.metadata as Record<string, unknown>)?.tokenIcons as Record<string, string> | undefined;

  const digestDate = report.digestDate ?? report.createdAt.slice(0, 10);
  const displayDate = new Date(digestDate + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const prevDate = getAdjacentDate(digestDate, -1);
  const nextDate = getAdjacentDate(digestDate, 1);
  const isToday = digestDate === new Date().toISOString().slice(0, 10);

  const generatedAt = new Date(report.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background atmosphere — matches landing page */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[-5%] w-[500px] h-[500px] rounded-full bg-blue-500/[0.06] blur-[120px]" />
        <div className="absolute top-[40%] left-[-10%] w-[400px] h-[400px] rounded-full bg-purple-500/[0.04] blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[350px] h-[350px] rounded-full bg-cyan-500/[0.03] blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative border-b border-border/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-3 px-6">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex items-center justify-center">
              <svg className="w-8 h-8" viewBox="0 0 32 32">
                <defs>
                  <linearGradient id="obol-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <rect width="32" height="32" rx="7" fill="#09090b" />
                <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#obol-g)" strokeWidth="3.5" />
                <line x1="4" y1="16" x2="28" y2="16" stroke="url(#obol-g)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md" />
            </div>
            <span className="text-sm font-bold text-foreground">Obol AI</span>
          </a>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex">
              <ShareBar digestDate={digestDate} />
            </div>
            <a
              href="/chat"
              className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white
                bg-gradient-to-r from-blue-500 to-purple-500
                shadow-lg shadow-blue-500/20
                hover:shadow-blue-500/30 hover:brightness-110
                transition-all duration-300"
            >
              Launch App
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative max-w-[720px] mx-auto px-6 pt-12 pb-20">
        {/* Title block */}
        <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Date nav */}
          <div className="flex items-center gap-1 mb-4">
            <a
              href={`/digest/${prevDate}`}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              title={`Previous: ${prevDate}`}
            >
              <ChevronLeft className="size-4" />
            </a>
            <span className="text-xs font-mono text-muted-foreground/60 px-2 py-1 rounded-md bg-muted/20 border border-border/30">
              {digestDate}
            </span>
            {!isToday && (
              <a
                href={`/digest/${nextDate}`}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                title={`Next: ${nextDate}`}
              >
                <ChevronRight className="size-4" />
              </a>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-tight mb-3">
            Daily Briefing — {displayDate}
          </h1>
          <p className="text-sm text-muted-foreground/60">
            Generated at {generatedAt}
          </p>
        </div>

        {/* Report body */}
        <style>{`
          .report-body p:has(> [data-streamdown="strong"]:first-child:last-child) {
            margin-top: 2.5rem;
            padding-top: 2rem;
            border-top: 1px solid hsl(var(--border) / 0.2);
            color: hsl(var(--foreground));
          }
          .report-body p > [data-streamdown="strong"]:first-child:last-child {
            display: block;
            font-size: 17px;
            font-weight: 600;
            letter-spacing: -0.01em;
            margin-bottom: 0.5rem;
            background: linear-gradient(to right, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .report-body > div:first-child p:first-child:has(> [data-streamdown="strong"]:first-child:last-child) {
            margin-top: 0;
            padding-top: 0;
            border-top: none;
          }
        `}</style>

        <div
          ref={bodyRef}
          className="report-body space-y-2 animate-in fade-in slide-in-from-bottom-3 duration-500"
          style={{ fontSize: "15px", lineHeight: "1.75" }}
        >
          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <div
                key={i}
                className="text-foreground/85
                  [&_strong]:text-foreground [&_strong]:font-semibold
                  [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_li]:text-foreground/75
                  [&_p]:mb-2 [&_p:last-child]:mb-0"
              >
                <InlineSegments segments={[seg]} tokenIcons={tokenIcons} />
              </div>
            ) : (
              <div key={i} className="my-3">
                <InlineSegments segments={[seg]} tokenIcons={tokenIcons} />
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="mt-20 pt-10 border-t border-border/30 space-y-8 animate-in fade-in duration-500">
          {/* Share section */}
          <div className="rounded-xl border border-border/40 bg-zinc-900/60 p-6 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Share this briefing</p>
                <p className="text-xs text-muted-foreground/60">Help others stay informed</p>
              </div>
              <ShareBar digestDate={digestDate} />
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-4 pt-4">
            <p className="text-xs text-muted-foreground/50">
              Powered by Obol AI — an agent that pays for intelligence
            </p>
            <a
              href="/chat"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white
                bg-gradient-to-r from-blue-500 via-blue-400 to-purple-500
                shadow-[0_0_24px_rgba(59,130,246,0.25)]
                hover:shadow-[0_0_40px_rgba(59,130,246,0.4)]
                hover:brightness-110
                transition-all duration-500
                overflow-hidden relative
                before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent
                before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700"
            >
              Try Obol AI <ExternalLink className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
