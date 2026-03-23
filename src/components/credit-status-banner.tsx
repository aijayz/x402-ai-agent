// src/components/credit-status-banner.tsx
"use client";

import { Wallet, Coins, Loader2, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerState =
  | "hidden"
  | "low-anon"
  | "low-wallet"
  | "exhausted-anon"
  | "exhausted-wallet"
  | "retrying";

interface CreditStatusBannerProps {
  state: BannerState;
  onConnectWallet: () => void;
  onTopUp: () => void;
  onDismiss?: () => void;
}

export function CreditStatusBanner({ state, onConnectWallet, onTopUp, onDismiss }: CreditStatusBannerProps) {
  if (state === "hidden") return null;

  const config = {
    "low-anon": {
      icon: Wallet,
      text: "1 free call remaining",
      cta: "Connect wallet for more",
      onCta: onConnectWallet,
      style: "border-blue-500/30 bg-blue-500/[0.06]",
      iconStyle: "text-blue-400",
      ctaStyle: "text-blue-400 hover:text-blue-300",
      dismissible: true,
    },
    "low-wallet": {
      icon: Coins,
      text: "Balance running low",
      cta: "Top up",
      onCta: onTopUp,
      style: "border-amber-500/30 bg-amber-500/[0.06]",
      iconStyle: "text-amber-400",
      ctaStyle: "text-amber-400 hover:text-amber-300",
      dismissible: true,
    },
    "exhausted-anon": {
      icon: Wallet,
      text: "Free calls used up",
      cta: null,
      onCta: onConnectWallet,
      style: "border-blue-500/40 bg-gradient-to-r from-blue-500/10 to-cyan-500/[0.06]",
      iconStyle: "text-blue-400",
      ctaStyle: "",
      dismissible: false,
    },
    "exhausted-wallet": {
      icon: Coins,
      text: "Credits depleted",
      cta: null,
      onCta: onTopUp,
      style: "border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/[0.06]",
      iconStyle: "text-amber-400",
      ctaStyle: "",
      dismissible: false,
    },
    "retrying": {
      icon: Loader2,
      text: "Resending your message...",
      cta: null,
      onCta: () => {},
      style: "border-green-500/30 bg-green-500/[0.06]",
      iconStyle: "text-green-400 animate-spin",
      ctaStyle: "",
      dismissible: false,
    },
  } as const;

  const c = config[state];
  const Icon = c.icon;

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm animate-in fade-in slide-in-from-bottom-1 duration-200",
      c.style
    )}>
      <Icon className={cn("size-4 shrink-0", c.iconStyle)} />
      <span className="text-foreground/90 text-xs sm:text-sm truncate">{c.text}</span>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {c.cta ? (
          <button
            onClick={c.onCta}
            className={cn("text-xs sm:text-sm font-medium transition-colors whitespace-nowrap", c.ctaStyle)}
          >
            {c.cta}
          </button>
        ) : state === "exhausted-anon" ? (
          <button
            onClick={onConnectWallet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium
              bg-blue-500/20 border border-blue-500/40 hover:border-blue-400/60
              text-blue-200 hover:text-blue-100 transition-all whitespace-nowrap min-h-[36px]"
          >
            <Wallet className="size-3.5" />
            Connect Wallet
          </button>
        ) : state === "exhausted-wallet" ? (
          <button
            onClick={onTopUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium
              bg-amber-500/20 border border-amber-500/40 hover:border-amber-400/60
              text-amber-200 hover:text-amber-100 transition-all whitespace-nowrap min-h-[36px]"
          >
            <ArrowUpRight className="size-3.5" />
            Top Up
          </button>
        ) : null}
        {c.dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
