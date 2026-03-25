"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Loader2, ExternalLink, Copy, CheckCheck, Coins, Zap, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useWallet } from "@/components/wallet-provider";
import { cn } from "@/lib/utils";
import { type ChainKey } from "@/lib/chains";
import { track } from "@/lib/analytics";

const AMOUNT_PRESETS = [1, 5, 10, 20];

const VALUE_HINT: Record<number, string> = {
  1:  "~7 DeFi analyses or ~100 whale queries",
  5:  "~38 DeFi analyses or ~500 whale queries",
  10: "~76 DeFi analyses or ~1,000 whale queries",
  20: "~150 DeFi analyses or ~2,000 whale queries",
};

/** Per-chain brand colors and SVG icons */
const CHAIN_BRAND: Record<string, { color: string; bg: string; border: string; glow: string; icon: React.ReactNode }> = {
  base: {
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/50",
    glow: "shadow-blue-500/20",
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm-3.5 5.5a3.5 3.5 0 0 1 3.5-3.5v7a3.5 3.5 0 0 1-3.5-3.5Z" />
      </svg>
    ),
  },
  ethereum: {
    color: "text-indigo-400",
    bg: "bg-indigo-500/15",
    border: "border-indigo-500/50",
    glow: "shadow-indigo-500/20",
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M12 1.5 4.5 12.2 12 16l7.5-3.8L12 1.5Z" opacity="0.6" />
        <path d="M12 16 4.5 12.2 12 22.5l7.5-10.3L12 16Z" />
      </svg>
    ),
  },
  arbitrum: {
    color: "text-cyan-400",
    bg: "bg-cyan-500/15",
    border: "border-cyan-500/50",
    glow: "shadow-cyan-500/20",
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10 8 2 4 2-4M10 16l2-4 2 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  optimism: {
    color: "text-red-400",
    bg: "bg-red-500/15",
    border: "border-red-500/50",
    glow: "shadow-red-500/20",
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">O</text>
      </svg>
    ),
  },
};

/** CTA button gradient per chain */
const CHAIN_CTA: Record<string, string> = {
  base: "from-blue-500 to-blue-400 shadow-blue-500/25 hover:shadow-blue-500/40",
  ethereum: "from-indigo-500 to-indigo-400 shadow-indigo-500/25 hover:shadow-indigo-500/40",
  arbitrum: "from-cyan-500 to-cyan-400 shadow-cyan-500/25 hover:shadow-cyan-500/40",
  optimism: "from-red-500 to-red-400 shadow-red-500/25 hover:shadow-red-500/40",
};

type TopUpStatus = "loading" | "idle" | "sending" | "confirming" | "done" | "error";

const STEPS = [
  { key: "sending", label: "Approve in wallet" },
  { key: "confirming", label: "Confirming on-chain" },
  { key: "done", label: "Credits added" },
] as const;

function StepIndicator({ status }: { status: TopUpStatus }) {
  const activeIndex = status === "sending" ? 0 : status === "confirming" ? 1 : 2;
  return (
    <div className="flex items-center justify-between px-2">
      {STEPS.map((step, i) => {
        const done = status === "done" || i < activeIndex;
        const active = i === activeIndex && status !== "done";
        return (
          <div key={step.key} className="flex items-center gap-2 flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div className={`flex items-center justify-center size-8 rounded-full border-2 transition-all duration-300 ${
                done
                  ? "border-green-500 bg-green-500/20 shadow-sm shadow-green-500/20"
                  : active
                    ? "border-blue-400 bg-blue-500/20 shadow-sm shadow-blue-500/20"
                    : "border-border bg-muted/30"
              }`}>
                {done ? (
                  <Check className="size-4 text-green-400" />
                ) : active ? (
                  <Loader2 className="size-4 text-blue-400 animate-spin" />
                ) : (
                  <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
                )}
              </div>
              <span className={`text-[11px] font-medium text-center leading-tight ${
                done ? "text-green-400" : active ? "text-blue-300" : "text-muted-foreground"
              }`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 rounded-full mx-1 mb-5 transition-all duration-500 ${
                i < activeIndex ? "bg-gradient-to-r from-green-500/60 to-green-500/30" : "bg-border"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TopUpSheet() {
  const { walletAddress, network, topUpOpen, setTopUpOpen, connectWallet, sendUsdc, switchChain, refreshBalance, onTopUpCompleteRef } = useWallet();

  const [depositInfo, setDepositInfo] = useState<{ depositAddress: string; network: string } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(5);
  const [topUpStatus, setTopUpStatus] = useState<TopUpStatus>("loading");
  const [topUpTxHash, setTopUpTxHash] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>("base");
  const [chainSwitching, setChainSwitching] = useState(false);
  const [chainConfigs, setChainConfigs] = useState<Record<string, { chainId: number; usdcAddress: string; name: string; explorerBaseUrl: string }> | null>(null);

  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!topUpOpen || !walletAddress || fetchingRef.current) return;

    fetchingRef.current = true;
    setTopUpStatus("loading");
    setTopUpTxHash(null);
    setTopUpError(null);
    setTopUpAmount(5);
    setDepositInfo(null);
    setSelectedChain("base");

    track("topup_started");
    fetch("/api/credits/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    })
      .then((res) => res.json())
      .then((data) => {
        setDepositInfo({ depositAddress: data.depositAddress, network: data.network });
        if (data.chains) setChainConfigs(data.chains);
        setTopUpStatus("idle");
      })
      .catch(() => {
        setTopUpError("Failed to fetch deposit address");
        setTopUpStatus("error");
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [topUpOpen, walletAddress]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (open && !walletAddress) {
      connectWallet();
      return;
    }
    if (!open) {
      fetchingRef.current = false;
    }
    setTopUpOpen(open);
  }, [walletAddress, connectWallet, setTopUpOpen]);

  const handleChainSelect = useCallback(async (chainKey: string) => {
    if (!chainConfigs || chainKey === selectedChain) return;
    const chain = chainConfigs[chainKey];
    if (!chain) return;

    setChainSwitching(true);
    try {
      await switchChain(chain.chainId);
      setSelectedChain(chainKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to switch chain";
      if (!(msg.includes("User denied") || msg.includes("rejected"))) {
        setTopUpError(`Chain switch failed: ${msg}`);
      }
    } finally {
      setChainSwitching(false);
    }
  }, [chainConfigs, selectedChain, switchChain]);

  const handleSendTopUp = useCallback(async () => {
    if (!walletAddress || !depositInfo) return;
    setTopUpStatus("sending");
    setTopUpError(null);
    try {
      const selectedConfig = chainConfigs?.[selectedChain];
      const txHash = await sendUsdc(depositInfo.depositAddress, topUpAmount, selectedConfig?.usdcAddress);
      setTopUpTxHash(txHash);
      setTopUpStatus("confirming");

      const res = await fetch("/api/credits/topup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash, sourceChain: selectedChain }),
      });

      if (res.ok) {
        setTopUpStatus("done");
        track("topup_completed", { amountUsdc: topUpAmount, chain: selectedChain });
        await refreshBalance();
        onTopUpCompleteRef.current?.();
      } else {
        const data = await res.json();
        setTopUpError(data.error || "Failed to confirm transaction");
        setTopUpStatus("error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("User denied") || msg.includes("rejected")) {
        setTopUpStatus("idle");
      } else {
        setTopUpError(msg);
        setTopUpStatus("error");
      }
    }
  }, [walletAddress, depositInfo, topUpAmount, sendUsdc, refreshBalance]);

  const handleCopy = useCallback(() => {
    if (!depositInfo) return;
    navigator.clipboard.writeText(depositInfo.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [depositInfo]);

  const explorerBase = chainConfigs?.[selectedChain]?.explorerBaseUrl ?? (network === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org");
  const isInProgress = topUpStatus === "sending" || topUpStatus === "confirming";
  const networkLabel = network === "base-sepolia" ? "Base Sepolia" : "Base";
  const multiChain = chainConfigs && Object.keys(chainConfigs).length > 1;
  const brand = CHAIN_BRAND[selectedChain] ?? CHAIN_BRAND.base;
  const ctaGradient = CHAIN_CTA[selectedChain] ?? CHAIN_CTA.base;

  return (
    <Sheet open={topUpOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="px-0 pb-0 overflow-hidden">
        {/* Header with chain-reactive gradient */}
        <div className="relative px-6 pt-2 pb-5 overflow-hidden">
          <div className={cn(
            "absolute inset-0 transition-colors duration-500",
            selectedChain === "ethereum" ? "bg-gradient-to-br from-indigo-500/10 via-indigo-400/5 to-transparent"
              : selectedChain === "arbitrum" ? "bg-gradient-to-br from-cyan-500/10 via-cyan-400/5 to-transparent"
              : selectedChain === "optimism" ? "bg-gradient-to-br from-red-500/10 via-red-400/5 to-transparent"
              : "bg-gradient-to-br from-blue-500/10 via-cyan-400/5 to-transparent"
          )} />
          <div className={cn(
            "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-colors duration-500",
            selectedChain === "ethereum" ? "bg-indigo-500/10"
              : selectedChain === "arbitrum" ? "bg-cyan-500/10"
              : selectedChain === "optimism" ? "bg-red-500/10"
              : "bg-blue-500/10"
          )} />
          <SheetHeader className="relative p-0">
            <div className="flex items-center gap-3 mb-1">
              <div className={cn(
                "flex items-center justify-center size-10 rounded-xl border shadow-sm transition-all duration-300",
                brand.bg, brand.border, brand.glow
              )}>
                <Coins className={cn("size-5", brand.color)} />
              </div>
              <div>
                <SheetTitle className="text-lg">Top Up Credits</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  {multiChain ? (
                    <span className="flex items-center gap-1.5">
                      <ArrowRightLeft className="size-3" />
                      Deposit USDC from any supported chain
                    </span>
                  ) : (
                    `Add USDC on ${networkLabel}`
                  )}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Loading state */}
          {topUpStatus === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="size-6 animate-spin text-blue-400" />
              <span className="text-xs text-muted-foreground">Preparing deposit...</span>
            </div>
          )}

          {/* Success state */}
          {topUpStatus === "done" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative size-16 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-500/20 border border-green-500/40 flex items-center justify-center shadow-lg shadow-green-500/10">
                  <Check className="size-7 text-green-400" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-xl font-semibold text-foreground">${topUpAmount.toFixed(2)} credited</p>
                <p className="text-sm text-muted-foreground">Your balance has been updated</p>
              </div>
              {topUpTxHash && (
                <a
                  href={`${explorerBase}/tx/${topUpTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View transaction <ExternalLink className="size-3" />
                </a>
              )}
              <Button variant="outline" size="sm" onClick={() => setTopUpOpen(false)} className="mt-2">
                Done
              </Button>
            </div>
          )}

          {/* In-progress state */}
          {isInProgress && (
            <div className="space-y-6 py-4">
              <StepIndicator status={topUpStatus} />
              {topUpStatus === "confirming" && (
                <p className="text-xs text-muted-foreground text-center">
                  On-chain confirmation can take 10–30 seconds
                </p>
              )}
              {topUpTxHash && (
                <div className="text-center">
                  <a
                    href={`${explorerBase}/tx/${topUpTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Track transaction <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Idle / error state */}
          {(topUpStatus === "idle" || topUpStatus === "error") && depositInfo && (
            <>
              {/* Multi-chain selector — prominent, branded pills */}
              {multiChain && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Deposit from</label>
                    <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                      {Object.keys(chainConfigs).length} chains
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(chainConfigs).map(([key, chain]) => {
                      const selected = selectedChain === key;
                      const b = CHAIN_BRAND[key] ?? CHAIN_BRAND.base;
                      return (
                        <button
                          key={key}
                          onClick={() => handleChainSelect(key)}
                          disabled={chainSwitching}
                          className={cn(
                            "relative flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 transition-all duration-200 text-left group",
                            selected
                              ? cn(b.bg, b.border, "shadow-sm", b.glow)
                              : "bg-muted/20 border-transparent hover:bg-muted/40 hover:border-muted-foreground/15"
                          )}
                        >
                          <div className={cn(
                            "flex items-center justify-center size-8 rounded-lg transition-colors duration-200",
                            selected ? cn(b.bg, b.color) : "bg-muted/50 text-muted-foreground group-hover:text-foreground/70"
                          )}>
                            {b.icon}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={cn(
                              "text-sm font-semibold transition-colors",
                              selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/80"
                            )}>
                              {chain.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 font-mono">
                              USDC
                            </span>
                          </div>
                          {selected && (
                            <div className={cn(
                              "absolute top-2 right-2 size-5 rounded-full flex items-center justify-center",
                              b.bg, b.border, "border"
                            )}>
                              <Check className={cn("size-3", b.color)} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {chainSwitching && (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Switching chain in wallet...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Amount selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Select amount</label>
                <div className="grid grid-cols-4 gap-2">
                  {AMOUNT_PRESETS.map((amt) => {
                    const selected = topUpAmount === amt;
                    return (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(amt)}
                        className={cn(
                          "relative flex flex-col items-center gap-0.5 py-3 rounded-xl text-sm font-semibold border-2 transition-all duration-200",
                          selected
                            ? cn(brand.bg, brand.border, "shadow-sm", brand.glow, "text-foreground")
                            : "bg-muted/30 border-transparent text-muted-foreground hover:border-muted-foreground/20 hover:text-foreground"
                        )}
                      >
                        <span className="text-lg font-bold">${amt}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">USDC</span>
                        {selected && (
                          <div className={cn(
                            "absolute -top-px -right-px size-4 rounded-full flex items-center justify-center",
                            selectedChain === "ethereum" ? "bg-indigo-500"
                              : selectedChain === "arbitrum" ? "bg-cyan-500"
                              : selectedChain === "optimism" ? "bg-red-500"
                              : "bg-blue-500"
                          )}>
                            <Check className="size-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Value estimate */}
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
                  <Zap className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{VALUE_HINT[topUpAmount]}</p>
                </div>
              </div>

              {/* Send button — color matches selected chain */}
              <button
                onClick={handleSendTopUp}
                className={cn(
                  "flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold",
                  "bg-gradient-to-r text-white shadow-lg",
                  "active:scale-[0.98] transition-all duration-200",
                  ctaGradient
                )}
              >
                Send ${topUpAmount.toFixed(2)} USDC
                {multiChain && chainConfigs?.[selectedChain] && (
                  <span className="text-white/60 font-normal">
                    via {chainConfigs[selectedChain].name}
                  </span>
                )}
              </button>

              {topUpError && (
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400 text-center">{topUpError}</p>
                </div>
              )}

              {/* Manual fallback */}
              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Or send USDC manually{chainConfigs?.[selectedChain] ? ` on ${chainConfigs[selectedChain].name}` : ""} to:
                </p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                  <code className="text-[11px] font-mono text-foreground/70 break-all flex-1 leading-relaxed">
                    {depositInfo.depositAddress}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                      border border-border hover:bg-muted hover:border-muted-foreground/30 transition-all"
                  >
                    {copied ? (
                      <><CheckCheck className="size-3 text-green-400" /> Copied</>
                    ) : (
                      <><Copy className="size-3" /> Copy</>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
