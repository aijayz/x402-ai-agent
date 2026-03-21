"use client";

import { useWallet } from "./wallet-provider";
import { LogOut, Wallet } from "lucide-react";

export function WalletPill() {
  const { walletAddress, balance, network, connectWallet, disconnectWallet } = useWallet();

  const networkLabel = network === "base-sepolia" ? "Sepolia" : "Base";

  if (!walletAddress) {
    return (
      <button
        onClick={connectWallet}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
          bg-gradient-to-r from-blue-500/10 via-cyan-400/10 to-amber-500/10
          border border-blue-500/30 hover:border-blue-500/50
          text-foreground hover:bg-gradient-to-r hover:from-blue-500/20 hover:via-cyan-400/20 hover:to-amber-500/20
          transition-all duration-200"
      >
        <Wallet className="size-4" />
        <span>Connect Wallet</span>
      </button>
    );
  }

  const displayBalance = balance != null
    ? `$${(balance / 1_000_000).toFixed(2)}`
    : null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm
      bg-muted/50 border border-border">
      <div className="w-2 h-2 rounded-full bg-green-500" />
      <span className="font-mono text-xs">
        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
      </span>
      <span className="text-muted-foreground">|</span>
      <span className="text-xs text-muted-foreground">{networkLabel}</span>
      {displayBalance && (
        <>
          <span className="text-muted-foreground">|</span>
          <span className="font-mono text-xs font-medium">{displayBalance}</span>
        </>
      )}
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
