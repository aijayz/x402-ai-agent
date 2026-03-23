"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Loader2, ExternalLink, Copy, CheckCheck, Coins, Zap } from "lucide-react";
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

const AMOUNT_PRESETS = [1, 5, 10, 20];

const VALUE_HINT: Record<number, string> = {
  1:  "~7 DeFi analyses or ~100 whale queries",
  5:  "~38 DeFi analyses or ~500 whale queries",
  10: "~76 DeFi analyses or ~1,000 whale queries",
  20: "~150 DeFi analyses or ~2,000 whale queries",
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
  const { walletAddress, network, topUpOpen, setTopUpOpen, connectWallet, sendUsdc, refreshBalance } = useWallet();

  const [depositInfo, setDepositInfo] = useState<{ depositAddress: string; network: string } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(5);
  const [topUpStatus, setTopUpStatus] = useState<TopUpStatus>("loading");
  const [topUpTxHash, setTopUpTxHash] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!topUpOpen || !walletAddress || fetchingRef.current) return;

    fetchingRef.current = true;
    setTopUpStatus("loading");
    setTopUpTxHash(null);
    setTopUpError(null);
    setTopUpAmount(5);
    setDepositInfo(null);

    fetch("/api/credits/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    })
      .then((res) => res.json())
      .then((data) => {
        setDepositInfo({ depositAddress: data.depositAddress, network: data.network });
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

  const handleSendTopUp = useCallback(async () => {
    if (!walletAddress || !depositInfo) return;
    setTopUpStatus("sending");
    setTopUpError(null);
    try {
      const txHash = await sendUsdc(depositInfo.depositAddress, topUpAmount);
      setTopUpTxHash(txHash);
      setTopUpStatus("confirming");

      const res = await fetch("/api/credits/topup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash }),
      });

      if (res.ok) {
        setTopUpStatus("done");
        await refreshBalance();
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

  const explorerBase = network === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org";
  const isInProgress = topUpStatus === "sending" || topUpStatus === "confirming";
  const networkLabel = network === "base-sepolia" ? "Base Sepolia" : "Base";

  return (
    <Sheet open={topUpOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="px-0 pb-0 overflow-hidden">
        {/* Visual header with gradient */}
        <div className="relative px-6 pt-2 pb-5 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-400/5 to-transparent" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <SheetHeader className="relative p-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center size-10 rounded-xl
                bg-gradient-to-br from-blue-500/20 to-cyan-400/20
                border border-blue-500/30 shadow-sm shadow-blue-500/10">
                <Coins className="size-5 text-blue-400" />
              </div>
              <div>
                <SheetTitle className="text-lg">Top Up Credits</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  Add USDC on {networkLabel}
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
                  View on BaseScan <ExternalLink className="size-3" />
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
                    Track on BaseScan <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Idle / error state */}
          {(topUpStatus === "idle" || topUpStatus === "error") && depositInfo && (
            <>
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
                            ? "bg-blue-500/15 border-blue-500/50 text-blue-200 shadow-sm shadow-blue-500/10"
                            : "bg-muted/30 border-transparent text-muted-foreground hover:border-muted-foreground/20 hover:text-foreground"
                        )}
                      >
                        <span className="text-lg font-bold">${amt}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">USDC</span>
                        {selected && (
                          <div className="absolute -top-px -right-px size-4 rounded-full bg-blue-500 flex items-center justify-center">
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

              {/* Send button */}
              <button
                onClick={handleSendTopUp}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold
                  bg-gradient-to-r from-blue-500 to-cyan-500
                  text-white shadow-lg shadow-blue-500/25
                  hover:from-blue-400 hover:to-cyan-400 hover:shadow-blue-500/40
                  active:scale-[0.98] transition-all duration-200"
              >
                Send ${topUpAmount.toFixed(2)} USDC
              </button>

              {topUpError && (
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400 text-center">{topUpError}</p>
                </div>
              )}

              {/* Manual fallback */}
              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Or send manually to:</p>
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
