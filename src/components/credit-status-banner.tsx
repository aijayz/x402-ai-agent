// src/components/credit-status-banner.tsx
"use client";

import { Wallet, Coins, Loader2, X, ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerState =
  | "hidden"
  | "low-anon"
  | "low-wallet"
  | "exhausted-anon"
  | "exhausted-wallet"
  | "retrying"
  | { type: "credited"; amountUsdc: string };

interface CreditStatusBannerProps {
  state: BannerState;
  onConnectWallet: () => void;
  onTopUp: () => void;
  onDismiss?: () => void;
}

export function CreditStatusBanner({ state, onConnectWallet, onTopUp, onDismiss }: CreditStatusBannerProps) {
  if (state === "hidden") return null;

  // Handle "credited" state (object variant)
  if (typeof state === "object" && state.type === "credited") {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm animate-in fade-in slide-in-from-bottom-1 duration-200 border-green-500/30 bg-green-500/[0.06]">
        <Check className="size-4 shrink-0 text-green-400" />
        <span className="text-foreground/90 text-xs sm:text-sm truncate">
          Claimed <span className="font-medium text-green-400">${state.amountUsdc}</span> in free credits
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  const config = {
    "low-anon": {
      icon: Wallet,
      text: "1 free call remaining",
      onCta: onConnectWallet,
      style: "border-blue-500/30 bg-blue-500/[0.06]",
      iconStyle: "text-blue-400",
      dismissible: true,
      ctaButton: { label: "Connect Wallet", icon: Wallet, color: "blue" as const },
    },
    "low-wallet": {
      icon: Coins,
      text: "Balance running low",
      onCta: onTopUp,
      style: "border-amber-500/30 bg-amber-500/[0.06]",
      iconStyle: "text-amber-400",
      dismissible: true,
      ctaButton: { label: "Top Up", icon: ArrowUpRight, color: "amber" as const },
    },
    "exhausted-anon": {
      icon: Wallet,
      text: "Free calls used up",
      onCta: onConnectWallet,
      style: "border-blue-500/40 bg-gradient-to-r from-blue-500/10 to-cyan-500/[0.06]",
      iconStyle: "text-blue-400",
      dismissible: false,
      ctaButton: { label: "Connect Wallet", icon: Wallet, color: "blue" as const },
    },
    "exhausted-wallet": {
      icon: Coins,
      text: "Credits depleted",
      onCta: onTopUp,
      style: "border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/[0.06]",
      iconStyle: "text-amber-400",
      dismissible: false,
      ctaButton: { label: "Top Up", icon: ArrowUpRight, color: "amber" as const },
    },
    "retrying": {
      icon: Loader2,
      text: "Resending your message...",
      onCta: () => {},
      style: "border-green-500/30 bg-green-500/[0.06]",
      iconStyle: "text-green-400 animate-spin",
      dismissible: false,
      ctaButton: null,
    },
  } as const;

  const c = config[state as keyof typeof config];
  const Icon = c.icon;

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm animate-in fade-in slide-in-from-bottom-1 duration-200",
      c.style
    )}>
      <Icon className={cn("size-4 shrink-0", c.iconStyle)} />
      <span className="text-foreground/90 text-xs sm:text-sm truncate">{c.text}</span>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {c.ctaButton && (() => {
          const CtaIcon = c.ctaButton.icon;
          const color = c.ctaButton.color;
          return (
            <button
              onClick={c.onCta}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                color === "blue" && "bg-blue-500/20 border border-blue-500/40 hover:border-blue-400/60 text-blue-200 hover:text-blue-100",
                color === "amber" && "bg-amber-500/20 border border-amber-500/40 hover:border-amber-400/60 text-amber-200 hover:text-amber-100",
              )}
            >
              <CtaIcon className="size-3.5" />
              {c.ctaButton.label}
            </button>
          );
        })()}
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
