"use client";

import { useState } from "react";
import { Share2, Check, Copy, ExternalLink, Zap } from "lucide-react";

interface SpendEvent {
  toolName: string;
  amountUsdc: number;
}

interface MessageActionsProps {
  messageId: string;
  textContent: string;
  spendEvents?: SpendEvent[];
  isAnonymous: boolean;
  onShare: (messageId: string, content: string) => Promise<string | null>;
}

/** X (Twitter) logo as inline SVG */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Farcaster logo — official mark from brand assets */
function FarcasterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} fill="currentColor">
      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H311.111V351.111H355.556L384.444 253.333H128.889Z" />
      <path d="M615.556 253.333L644.444 351.111H688.889V746.667C676.616 746.667 666.667 756.616 666.667 768.889V795.556H662.222C649.949 795.556 640 805.505 640 817.778V844.444H888.889V817.778C888.889 805.505 878.939 795.556 866.667 795.556H862.222V768.889C862.222 756.616 852.273 746.667 840 746.667H817.778V351.111H862.222L891.111 253.333H615.556Z" />
    </svg>
  );
}

export function MessageActions({
  messageId,
  textContent,
  spendEvents,
  isAnonymous,
  onShare,
}: MessageActionsProps) {
  const [shareState, setShareState] = useState<"idle" | "saving" | "shared">("idle");
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const totalCost = spendEvents?.reduce((sum, e) => sum + e.amountUsdc, 0) ?? 0;
  const hasMarkers = /\[(METRIC|VERDICT|SCORE):/.test(textContent);

  // Nothing to show — no cost and no shareable content
  if (totalCost === 0 && !hasMarkers) return null;

  const handleShareClick = async () => {
    setShareState("saving");
    const url = await onShare(messageId, textContent);
    if (url) {
      setSharedUrl(url);
      setShareState("shared");
      setLinkCopied(true);
      // Reset "copied" indicator after 3s but keep panel open
      setTimeout(() => setLinkCopied(false), 3000);
    } else {
      setShareState("idle");
    }
  };

  const handleCopyLink = async () => {
    if (!sharedUrl) return;
    await navigator.clipboard.writeText(sharedUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  };

  const shareOnX = () => {
    if (!sharedUrl) return;
    const text = encodeURIComponent("Check out this analysis from @ObolAI");
    const url = encodeURIComponent(sharedUrl);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  const shareOnFarcaster = () => {
    if (!sharedUrl) return;
    const text = encodeURIComponent("Check out this analysis from Obol AI");
    const url = encodeURIComponent(sharedUrl);
    window.open(`https://warpcast.com/~/compose?text=${text}&embeds[]=${url}`, "_blank");
  };

  return (
    <div className="mt-4 pt-3 border-t border-border/30 space-y-3">
      {/* Action bar: cost + share */}
      <div className="flex items-center justify-between">
        {/* Cost indicator */}
        {totalCost > 0 && (
          <div className="group relative">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="size-3 text-amber-500" />
              <span className="font-mono">${totalCost.toFixed(3)}</span>
              <span className="text-muted-foreground/50">via x402</span>
            </span>
            {/* Hover tooltip with breakdown */}
            {spendEvents && spendEvents.length > 1 && (
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                <div className="bg-popover border border-border rounded-lg shadow-lg p-2.5 text-xs font-mono space-y-1 min-w-[180px]">
                  {spendEvents.map((e, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{e.toolName.replace(/_/g, " ")}</span>
                      <span>${e.amountUsdc.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share button */}
        {hasMarkers && shareState === "idle" && (
          <button
            onClick={handleShareClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors ml-auto"
          >
            <Share2 className="size-3.5" /> Share report
          </button>
        )}
        {hasMarkers && shareState === "saving" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground ml-auto">
            <Share2 className="size-3.5 animate-pulse" /> Saving...
          </span>
        )}
      </div>

      {/* Share panel — appears after report is saved */}
      {shareState === "shared" && sharedUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-green-400 font-medium mr-1">
            <Check className="size-3.5" /> Report saved
          </span>
          <button
            onClick={shareOnX}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <XIcon className="size-3.5" /> Share
          </button>
          <button
            onClick={shareOnFarcaster}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-colors"
          >
            <FarcasterIcon className="size-3.5" /> Farcaster
          </button>
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-foreground/80 hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            {linkCopied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
            {linkCopied ? "Copied" : "Copy link"}
          </button>
          <a
            href={sharedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-foreground/80 hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <ExternalLink className="size-3.5" /> Preview
          </a>
        </div>
      )}
    </div>
  );
}
