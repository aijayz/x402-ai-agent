"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, TrendingDown } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet } from "@/components/wallet-provider";

interface LedgerEntry {
  label: string;
  amountMicroUsdc: number;
  type: "credit" | "debit";
  createdAt: string;
}

interface DateGroup {
  label: string;
  entries: LedgerEntry[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatUsdc(micro: number): string {
  return (micro / 1_000_000).toFixed(3);
}

function groupByDate(entries: LedgerEntry[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);

  const groups: Record<string, LedgerEntry[]> = {};
  const order: string[] = [];

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    let label: string;
    if (d >= today) label = "Today";
    else if (d >= yesterday) label = "Yesterday";
    else if (d >= weekAgo) label = "This Week";
    else label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (!groups[label]) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(entry);
  }

  return order.map((label) => ({ label, entries: groups[label] }));
}

export function SpendHistorySheet() {
  const { walletAddress, spendHistoryOpen, setSpendHistoryOpen } = useWallet();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [balanceMicro, setBalanceMicro] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const res = await fetch("/api/credits/history");
      if (res.ok) {
        const data = await res.json();
        setLedger(data.ledger ?? []);
        setBalanceMicro(data.balanceMicroUsdc ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (spendHistoryOpen) fetchHistory();
  }, [spendHistoryOpen, fetchHistory]);

  const dateGroups = useMemo(() => groupByDate(ledger), [ledger]);
  const totalIn = useMemo(
    () => ledger.filter((e) => e.type === "credit").reduce((s, e) => s + e.amountMicroUsdc, 0),
    [ledger],
  );
  const totalOut = useMemo(
    () => ledger.filter((e) => e.type === "debit").reduce((s, e) => s + e.amountMicroUsdc, 0),
    [ledger],
  );

  return (
    <Sheet open={spendHistoryOpen} onOpenChange={setSpendHistoryOpen}>
      <SheetContent side="right" className="w-[min(380px,100vw)] sm:w-[420px] p-0 flex flex-col">
        {/* Header with gradient — matches topup sheet style */}
        <div className="relative px-6 pt-6 pb-5 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 via-amber-400/4 to-transparent" />
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 bg-amber-500/8" />

          <SheetHeader className="relative p-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 shadow-sm shadow-amber-500/10">
                <Coins className="size-5 text-amber-400" />
              </div>
              <div>
                <SheetTitle className="text-lg">Ledger</SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  {ledger.length} transactions
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Balance hero */}
        <div className="mx-5 mb-4 rounded-xl bg-gradient-to-br from-muted/80 via-muted/50 to-muted/30 border border-border p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Balance</span>
          </div>
          <div className="text-2xl font-mono font-bold text-foreground tracking-tight mb-4">
            ${formatUsdc(balanceMicro)}
            <span className="text-sm font-normal text-muted-foreground ml-1.5">USDC</span>
          </div>

          {/* Mini stats row */}
          <div className="flex gap-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <div className="size-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-muted-foreground">
                In <span className="font-mono font-medium text-emerald-400">${formatUsdc(totalIn)}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-1.5 rounded-full bg-amber-400" />
              <span className="text-[11px] text-muted-foreground">
                Out <span className="font-mono font-medium text-amber-300">${formatUsdc(totalOut)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Transaction list */}
        <ScrollArea className="flex-1">
          {loading && ledger.length === 0 && (
            <div className="px-5 py-16 text-center">
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <div className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                Loading transactions...
              </div>
            </div>
          )}
          {!loading && ledger.length === 0 && (
            <div className="px-5 py-16 text-center space-y-3">
              <div className="flex items-center justify-center">
                <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center">
                  <TrendingDown className="size-5 text-muted-foreground/30" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground/60">No activity yet</p>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  Tool charges and top-ups will appear here
                </p>
              </div>
            </div>
          )}

          {dateGroups.map((group) => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="sticky top-0 z-10 px-5 py-2 bg-background/80 backdrop-blur-sm border-b border-border/40">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
              </div>

              <div className="px-3 py-1">
                {group.entries.map((entry, i) => {
                  const isCredit = entry.type === "credit";
                  return (
                    <div
                      key={`${entry.createdAt}-${i}`}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/20 transition-colors group"
                    >
                      {/* Direction icon */}
                      <div
                        className={`flex items-center justify-center size-8 rounded-lg shrink-0 transition-colors ${
                          isCredit
                            ? "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/15"
                            : "bg-amber-500/8 text-amber-400/80 group-hover:bg-amber-500/12"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownLeft className="size-4" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </div>

                      {/* Label + time */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-foreground truncate leading-tight">
                          {entry.label.replace(/_/g, " ")}
                        </div>
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">
                          {formatTime(entry.createdAt)}
                        </div>
                      </div>

                      {/* Amount */}
                      <div
                        className={`text-sm font-mono font-semibold shrink-0 tabular-nums ${
                          isCredit ? "text-emerald-400" : "text-amber-300"
                        }`}
                      >
                        {isCredit ? "+" : "-"}${formatUsdc(entry.amountMicroUsdc)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Bottom padding */}
          {ledger.length > 0 && <div className="h-4" />}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
