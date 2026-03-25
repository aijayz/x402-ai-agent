"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { track, identifyUser, resetUser } from "@/lib/analytics";

const USDC_ADDRESS: Record<string, string> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// ERC-20 transfer(address,uint256) function selector
const TRANSFER_SELECTOR = "0xa9059cbb";

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

export interface CreditEvent {
  type: "claimed" | "topped-up";
  amountMicroUsdc: number;
}

interface WalletContextValue {
  walletAddress: string | null;
  balance: number | null; // micro-USDC
  freeCallsRemaining: number | null;
  lastCreditEvent: CreditEvent | null;
  clearCreditEvent: () => void;
  network: NetworkId;
  topUpOpen: boolean;
  setTopUpOpen: (open: boolean) => void;
  connectWallet: () => Promise<string | undefined>;
  disconnectWallet: () => void;
  refreshBalance: () => Promise<void>;
  sendUsdc: (to: string, amountUsdc: number, usdcAddress?: string) => Promise<string>;
  switchChain: (chainId: number) => Promise<void>;
  updateFromMetadata: (meta: { budgetRemaining?: number; freeCallsRemaining?: number }) => void;
  onTopUpCompleteRef: React.RefObject<(() => void) | null>;
  /** True while /api/auth/me is being checked on mount */
  isRestoringSession: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [freeCallsRemaining, setFreeCallsRemaining] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [lastCreditEvent, setLastCreditEvent] = useState<CreditEvent | null>(null);
  const onTopUpCompleteRef = useRef<(() => void) | null>(null);
  const clearCreditEvent = useCallback(() => setLastCreditEvent(null), []);
  const network = getTargetNetwork();
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Restore wallet session from HttpOnly cookie on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.authenticated && data.walletAddress) {
          setWalletAddress(data.walletAddress);
          setBalance(data.balanceMicroUsdc ?? null);
          identifyUser(data.walletAddress);
        }
      } catch {
        // Silent — user will just appear anonymous
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = useCallback(async (): Promise<string | undefined> => {
    if (isConnecting) return undefined;
    if (typeof window === "undefined") return undefined;

    // If no injected provider, try deep-linking into MetaMask mobile app
    if (typeof window.ethereum === "undefined") {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        // MetaMask deep link opens the current page inside MetaMask's in-app browser
        const mmUrl = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
        window.location.href = mmUrl;
        return undefined;
      }
      alert("Please install MetaMask or another EVM wallet");
      return undefined;
    }

    setIsConnecting(true);
    try {
      // Force MetaMask to show the account picker (not just return the cached account)
      // wallet_requestPermissions re-prompts the user to select an account
      try {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Some wallets don't support wallet_requestPermissions — fall through
      }
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
      identifyUser(address);
      track("wallet_connected");

      // Claim free credits
      try {
        const res = await fetch("/api/credits/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
        const data = await res.json();
        if (res.ok) {
          const amount = data.granted ?? data.balance ?? 0;
          setBalance(amount);
          if (amount > 0) {
            setLastCreditEvent({ type: "claimed", amountMicroUsdc: amount });
            track("credits_claimed", { amountUsdc: amount / 1_000_000 });
          }
        } else if (res.status === 409) {
          // Already claimed — just set balance, no event
          setBalance(data.balance ?? 0);
        } else {
          console.error("[WALLET] Failed to claim free credits", { status: res.status, data });
          await refreshBalance();
        }
      } catch (err) {
        console.error("[WALLET] Network error during free credits claim", err);
        await refreshBalance();
      }

      return address;
    } catch (err) {
      // User rejected or wallet error — return undefined silently
      if ((err as { code?: number })?.code === 4001) return undefined;
      console.error("[WALLET] Connection failed", err);
      return undefined;
    } finally {
      setIsConnecting(false);
    }
  }, [network, isConnecting, refreshBalance]);

  const switchChain = useCallback(async (chainId: number) => {
    if (typeof window.ethereum === "undefined") throw new Error("No wallet");
    const hexChainId = `0x${chainId.toString(16)}`;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError: unknown) {
      // 4902 = chain not added. For well-known networks (Ethereum, Arbitrum,
      // Optimism) MetaMask already knows them, so 4902 is unlikely. Re-throw.
      throw switchError;
    }
  }, []);

  const sendUsdc = useCallback(async (to: string, amountUsdc: number, usdcAddress?: string): Promise<string> => {
    if (!walletAddress || typeof window.ethereum === "undefined") {
      throw new Error("Wallet not connected");
    }

    const usdcContract = usdcAddress ?? USDC_ADDRESS[network];
    // USDC has 6 decimals — amountUsdc is a float like 5.00
    const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000));

    // Encode transfer(address, uint256) calldata
    const paddedTo = to.slice(2).toLowerCase().padStart(64, "0");
    const paddedAmount = amountRaw.toString(16).padStart(64, "0");
    const data = `${TRANSFER_SELECTOR}${paddedTo}${paddedAmount}`;

    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: walletAddress,
        to: usdcContract,
        data,
      }],
    }) as string;

    return txHash;
  }, [walletAddress, network]);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setBalance(null);
    setFreeCallsRemaining(null);
    resetUser();
    // Clear wallet auth cookie
    document.cookie = "wallet_auth=; path=/; max-age=0";
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
    <WalletContext.Provider value={{ walletAddress, balance, freeCallsRemaining, lastCreditEvent, clearCreditEvent, network, topUpOpen, setTopUpOpen, connectWallet, disconnectWallet, refreshBalance, sendUsdc, switchChain, updateFromMetadata, onTopUpCompleteRef, isRestoringSession }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
