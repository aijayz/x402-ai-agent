"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const CHAIN_CONFIG = {
  "base-sepolia": {
    chainId: "0x14a34", // 84532
    chainName: "Base Sepolia",
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  base: {
    chainId: "0x2105", // 8453
    chainName: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
} as const;

type NetworkId = keyof typeof CHAIN_CONFIG;

function getTargetNetwork(): NetworkId {
  const env = process.env.NEXT_PUBLIC_NETWORK;
  if (env === "base") return "base";
  return "base-sepolia";
}

interface WalletContextValue {
  walletAddress: string | null;
  balance: number | null; // micro-USDC
  freeCallsRemaining: number | null;
  network: NetworkId;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  refreshBalance: () => Promise<void>;
  updateFromMetadata: (meta: { budgetRemaining?: number; freeCallsRemaining?: number }) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [freeCallsRemaining, setFreeCallsRemaining] = useState<number | null>(null);
  const network = getTargetNetwork();

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/credits/balance?wallet=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balanceMicroUsdc);
      }
    } catch {
      // Silently fail — balance will update on next message metadata
    }
  }, [walletAddress]);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || typeof window.ethereum === "undefined") {
      alert("Please install MetaMask or another EVM wallet");
      return;
    }

    // Request accounts
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    }) as string[];
    const address = accounts[0];

    // Switch to target chain
    const chain = CHAIN_CONFIG[network];
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.chainId }],
      });
    } catch (switchError: unknown) {
      // Chain not added to wallet — add it
      if ((switchError as { code?: number })?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chain.chainId,
            chainName: chain.chainName,
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: chain.blockExplorerUrls,
            nativeCurrency: chain.nativeCurrency,
          }],
        });
      } else {
        throw switchError;
      }
    }

    setWalletAddress(address);

    // Claim free credits
    const res = await fetch("/api/credits/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    });
    const data = await res.json();
    setBalance(data.balance ?? 0);
  }, [network]);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setBalance(null);
    setFreeCallsRemaining(null);
  }, []);

  const updateFromMetadata = useCallback((meta: { budgetRemaining?: number; freeCallsRemaining?: number }) => {
    if (meta.budgetRemaining != null && walletAddress) {
      // budgetRemaining is in USDC float, convert to micro
      setBalance(Math.round(meta.budgetRemaining * 1_000_000));
    }
    if (meta.freeCallsRemaining != null) {
      setFreeCallsRemaining(meta.freeCallsRemaining);
    }
  }, [walletAddress]);

  return (
    <WalletContext.Provider value={{ walletAddress, balance, freeCallsRemaining, network, connectWallet, disconnectWallet, refreshBalance, updateFromMetadata }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
