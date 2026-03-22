"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Check, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWallet } from "@/components/wallet-provider";

export function TopUpSheet() {
  const { walletAddress, network, topUpOpen, setTopUpOpen, connectWallet, sendUsdc, refreshBalance } = useWallet();

  const [depositInfo, setDepositInfo] = useState<{ depositAddress: string; network: string } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(5);
  const [topUpStatus, setTopUpStatus] = useState<"idle" | "sending" | "confirming" | "done" | "error">("idle");
  const [topUpTxHash, setTopUpTxHash] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const fetchingRef = useRef(false);

  // Fetch deposit info whenever the sheet opens
  useEffect(() => {
    if (!topUpOpen || !walletAddress || fetchingRef.current) return;

    fetchingRef.current = true;
    setTopUpStatus("idle");
    setTopUpTxHash(null);
    setTopUpError(null);
    setTopUpAmount(5);

    fetch("/api/credits/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    })
      .then((res) => res.json())
      .then((data) => {
        setDepositInfo({ depositAddress: data.depositAddress, network: data.network });
      })
      .catch(() => {
        setTopUpError("Failed to fetch deposit info");
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

  const explorerBase = network === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org";

  return (
    <Sheet open={topUpOpen} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Top Up Credits</SheetTitle>
          <SheetDescription>
            Add USDC credits on {network === "base-sepolia" ? "Base Sepolia" : "Base"}.
          </SheetDescription>
        </SheetHeader>
        {depositInfo && (
          <div className="mt-6 space-y-5">
            {topUpStatus === "done" ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="size-6 text-green-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium text-foreground">${topUpAmount.toFixed(2)} credited</p>
                  <p className="text-sm text-muted-foreground">Your credits have been updated.</p>
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
            ) : (
              <>
                {/* Amount selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Amount (USDC)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 5, 10].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(amt)}
                        disabled={topUpStatus !== "idle"}
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
                </div>

                {/* Send button */}
                <Button
                  onClick={handleSendTopUp}
                  disabled={topUpStatus !== "idle"}
                  className="w-full"
                >
                  {topUpStatus === "sending" && (
                    <><Loader2 className="size-4 animate-spin mr-2" /> Approve in wallet...</>
                  )}
                  {topUpStatus === "confirming" && (
                    <><Loader2 className="size-4 animate-spin mr-2" /> Confirming on-chain...</>
                  )}
                  {topUpStatus === "idle" && `Send $${topUpAmount.toFixed(2)} USDC`}
                  {topUpStatus === "error" && "Try again"}
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
                      onClick={() => navigator.clipboard.writeText(depositInfo.depositAddress)}
                      className="shrink-0 px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
