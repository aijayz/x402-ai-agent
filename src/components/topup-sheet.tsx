"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Loader2, ExternalLink, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWallet } from "@/components/wallet-provider";

const AMOUNT_PRESETS = [1, 5, 10, 20];

// Rough value hints per dollar (at 30% markup, ~$0.13/DeFi scan, ~$0.013/whale query)
const VALUE_HINT: Record<number, string> = {
  1: "~7 DeFi scans",
  5: "~38 DeFi scans",
  10: "~76 DeFi scans",
  20: "~153 DeFi scans",
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
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const done = status === "done" || i < activeIndex;
        const active = i === activeIndex && status !== "done";
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs ${done ? "text-green-400" : active ? "text-blue-400" : "text-muted-foreground"}`}>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                done ? "border-green-500/50 bg-green-500/20" : active ? "border-blue-500/50 bg-blue-500/20" : "border-border"
              }`}>
                {done ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
              </div>
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 shrink-0 ${i < activeIndex ? "bg-green-500/40" : "bg-border"}`} />
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

  // Fetch deposit info whenever the sheet opens
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

  return (
    <Sheet open={topUpOpen} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Top Up Credits</SheetTitle>
          <SheetDescription>
            Add USDC credits on {network === "base-sepolia" ? "Base Sepolia" : "Base"}.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Loading state */}
          {topUpStatus === "loading" && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Success state */}
          {topUpStatus === "done" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="size-6 text-green-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium text-foreground">${topUpAmount.toFixed(2)} credited</p>
                <p className="text-sm text-muted-foreground">Your balance has been updated.</p>
              </div>
              {topUpTxHash && (
                <a
                  href={`${explorerBase}/tx/${topUpTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View transaction <ExternalLink className="size-3" />
                </a>
              )}
              <Button variant="outline" size="sm" onClick={() => setTopUpOpen(false)}>
                Done
              </Button>
            </div>
          )}

          {/* In-progress state */}
          {isInProgress && (
            <div className="space-y-5">
              <StepIndicator status={topUpStatus} />
              {topUpStatus === "confirming" && (
                <p className="text-xs text-muted-foreground text-center">
                  On-chain confirmation can take 10–30 seconds.
                </p>
              )}
              {topUpTxHash && (
                <div className="text-center">
                  <a
                    href={`${explorerBase}/tx/${topUpTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
              {/* Amount selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Amount (USDC)</label>
                <div className="grid grid-cols-4 gap-2">
                  {AMOUNT_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTopUpAmount(amt)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors
                        ${topUpAmount === amt
                          ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                          : "bg-muted/50 border-border text-muted-foreground hover:border-blue-500/30"
                        }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{VALUE_HINT[topUpAmount]}</p>
              </div>

              {/* Send button */}
              <Button onClick={handleSendTopUp} className="w-full">
                Send ${topUpAmount.toFixed(2)} USDC
              </Button>

              {topUpError && (
                <p className="text-sm text-red-400 text-center">{topUpError}</p>
              )}

              {/* Manual fallback */}
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground">Or send manually to:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-muted-foreground break-all flex-1">
                    {depositInfo.depositAddress}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors flex items-center gap-1"
                  >
                    {copied ? <><CheckCheck className="size-3 text-green-400" /> Copied</> : <><Copy className="size-3" /> Copy</>}
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
