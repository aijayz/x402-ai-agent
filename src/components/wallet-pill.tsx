"use client";

import { useWallet } from "./wallet-provider";
import { LogOut, Wallet, Coins, ArrowUpRight } from "lucide-react";

export function WalletPill() {
  const { walletAddress, network, connectWallet, disconnectWallet } = useWallet();

  const networkLabel = network === "base-sepolia" ? "Sepolia" : "Base";

  if (!walletAddress) {
    return (
      <button
        onClick={connectWallet}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
          bg-gradient-to-r from-blue-500/20 via-cyan-400/15 to-blue-500/20
          border border-blue-500/40 hover:border-blue-400/60
          text-blue-200 hover:text-blue-100
          hover:from-blue-500/30 hover:via-cyan-400/25 hover:to-blue-500/30
          transition-all duration-200 shadow-sm shadow-blue-500/10"
      >
        <Wallet className="size-4" />
        <span className="hidden sm:inline">Connect Wallet</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm
      bg-muted/50 border border-border">
      <div className="w-2 h-2 rounded-full bg-green-500" />
      <span className="font-mono text-xs">
        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
      </span>
      <span className="text-muted-foreground">|</span>
      <span className="text-xs text-muted-foreground">{networkLabel}</span>
      <button
        onClick={disconnectWallet}
        className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
        title="Disconnect wallet"
      >
        <LogOut className="size-3 text-muted-foreground" />
      </button>
    </div>
  );
}

export function CreditBadge() {
  const { walletAddress, balance, setTopUpOpen } = useWallet();

  if (!walletAddress || balance == null) return null;

  const displayBalance = (balance / 1_000_000).toFixed(2);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
        bg-amber-500/10 border border-amber-500/30 text-amber-300">
        <Coins className="size-3" />
        <span className="font-mono font-medium">${displayBalance}</span>
      </div>
      <button
        onClick={() => setTopUpOpen(true)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
          bg-gradient-to-r from-blue-500/20 to-cyan-400/20
          border border-blue-500/40 hover:border-blue-400/60
          text-blue-300 hover:text-blue-200
          hover:from-blue-500/30 hover:to-cyan-400/30
          transition-all duration-200"
      >
        <ArrowUpRight className="size-3" />
        Top Up
      </button>
    </div>
  );
}
