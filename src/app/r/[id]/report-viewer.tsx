"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { ObolLogo } from "@/components/obol-logo";
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

export function ReportViewer({ report }: { report: Report }) {
  const { cleanText } = parseReportActions(report.content);
  const segments = parseIntoSegments(cleanText);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAddressLinks(bodyRef);
  const reportDate = new Date(report.createdAt);
  const date = reportDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = reportDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[680px] mx-auto px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
            <ObolLogo size={20} />
            Obol AI
          </a>
          <ShareBar reportId={report.id} />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[680px] mx-auto px-6 pt-10 pb-16">
        {/* Title block */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-foreground leading-snug mb-2">
            {report.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {date} at {time}
          </p>
        </div>

        {/* Report body — tuned for readability */}
        <style>{`
          /* Section headers: bold-only paragraphs get a top divider.
             The span is always :first-child:last-child (element-wise) even
             when trailing text nodes exist, so we style the span as block
             to force the text after it onto a new line. */
          .report-body p:has(> [data-streamdown="strong"]:first-child:last-child) {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid hsl(var(--border) / 0.3);
            color: hsl(var(--foreground));
          }
          .report-body p > [data-streamdown="strong"]:first-child:last-child {
            display: block;
            font-size: 16px;
            margin-bottom: 0.25rem;
          }
          .report-body > div:first-child p:first-child:has(> [data-streamdown="strong"]:first-child:last-child) {
            margin-top: 0;
            padding-top: 0;
            border-top: none;
          }
        `}</style>
        <div
          ref={bodyRef}
          className="report-body space-y-1.5"
          style={{ fontSize: "15px", lineHeight: "1.7" }}
        >
          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <div
                key={i}
                className="text-foreground/90
                  [&_strong]:text-foreground [&_strong]:font-semibold
                  [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_li]:text-foreground/80
                  [&_p]:mb-1.5 [&_p:last-child]:mb-0"
              >
                <InlineSegments segments={[seg]} />
              </div>
            ) : (
              <div key={i} className="my-2">
                <InlineSegments segments={[seg]} />
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-border/40 space-y-6">
          {/* Share row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Share this analysis
            </p>
            <ShareBar reportId={report.id} />
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 pt-4">
            <p className="text-xs text-muted-foreground/60">
              Powered by Obol AI — an agent that pays for intelligence
            </p>
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
