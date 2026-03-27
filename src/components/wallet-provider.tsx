"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { track, identifyUser, resetUser } from "@/lib/analytics";
import { useIsMobileWithoutWallet } from "@/hooks/use-mobile-wallet";
import { MobileWalletSheet } from "@/components/mobile-wallet-sheet";

const USDC_ADDRESS: Record<string, string> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// ERC-20 transfer(address,uint256) function selector
const TRANSFER_SELECTOR = "0xa9059cbb";

type NetworkId = "base" | "base-sepolia";

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
  spendHistoryOpen: boolean;
  setSpendHistoryOpen: (open: boolean) => void;
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
  const [spendHistoryOpen, setSpendHistoryOpen] = useState(false);
  const [lastCreditEvent, setLastCreditEvent] = useState<CreditEvent | null>(null);
  const onTopUpCompleteRef = useRef<(() => void) | null>(null);
  const clearCreditEvent = useCallback(() => setLastCreditEvent(null), []);
  const network = getTargetNetwork();
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Wagmi hooks — replace raw window.ethereum calls
  const { address: wagmiAddress } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal, connectModalOpen } = useConnectModal();

  // Mobile: bypass RainbowKit modal on iOS Safari without injected wallet
  const isMobile = useIsMobileWithoutWallet();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Holds the resolve fn of a pending connectWallet() promise
  const connectResolveRef = useRef<((addr: string | undefined) => void) | null>(null);

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
        // Silent — user will appear anonymous
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

  // Claim free credits after connecting; falls back to a direct balance fetch on error
  const claimCredits = useCallback(async (address: string) => {
    try {
      const res = await fetch("/api/credits/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (res.ok) {
        const granted = data.granted ?? 0;
        const currentBalance = data.balance ?? granted;
        setBalance(currentBalance);
        if (granted > 0) {
          setLastCreditEvent({ type: "claimed", amountMicroUsdc: granted });
          track("credits_claimed", { amountUsdc: granted / 1_000_000 });
        }
      } else if (res.status === 409) {
        // Already claimed — just sync balance
        setBalance(data.balance ?? 0);
      } else {
        console.error("[WALLET] Failed to claim free credits", { status: res.status, data });
        const balRes = await fetch(`/api/credits/balance?wallet=${address}`);
        if (balRes.ok) {
          const balData = await balRes.json();
          setBalance(balData.balanceMicroUsdc);
        }
      }
    } catch (err) {
      console.error("[WALLET] Network error during free credits claim", err);
    }
  }, []);

  // When wagmi connects, sync walletAddress and resolve any pending connectWallet() promise
  useEffect(() => {
    if (!wagmiAddress) return;
    setWalletAddress(wagmiAddress);

    if (connectResolveRef.current) {
      // Active connect flow — user went through the modal
      const resolve = connectResolveRef.current;
      connectResolveRef.current = null;
      identifyUser(wagmiAddress);
      track("wallet_connected");
      claimCredits(wagmiAddress).then(() => resolve(wagmiAddress));
    }
  }, [wagmiAddress, claimCredits]);

  // If RainbowKit modal closes without connecting, resolve the pending promise with undefined
  useEffect(() => {
    if (!connectModalOpen && connectResolveRef.current && !wagmiAddress) {
      const resolve = connectResolveRef.current;
      connectResolveRef.current = null;
      resolve(undefined);
    }
  }, [connectModalOpen, wagmiAddress]);

  // Handle mobile sheet dismiss (backdrop tap / swipe down)
  const handleMobileSheetChange = useCallback((open: boolean) => {
    setMobileSheetOpen(open);
    if (!open && connectResolveRef.current && !wagmiAddress) {
      const resolve = connectResolveRef.current;
      connectResolveRef.current = null;
      resolve(undefined);
    }
  }, [wagmiAddress]);

  const triggerCbwConnect = useCallback(() => {
    const cbw = connectors.find((c) => c.id === "coinbaseWalletSDK");
    if (cbw) {
      connect({ connector: cbw });
    } else {
      // Fallback: open RainbowKit modal if CBW connector not found
      openConnectModal?.();
    }
  }, [connectors, connect, openConnectModal]);

  // Handle Coinbase Wallet tap — close sheet and trigger wagmi connector
  const handleCbwTap = useCallback(() => {
    setMobileSheetOpen(false);
    triggerCbwConnect();
  }, [triggerCbwConnect]);

  const connectWallet = useCallback(async (): Promise<string | undefined> => {
    // Already connected via wagmi
    if (wagmiAddress) {
      if (!walletAddress) {
        setWalletAddress(wagmiAddress);
        identifyUser(wagmiAddress);
        await claimCredits(wagmiAddress);
      }
      return wagmiAddress;
    }

    // iOS Safari without injected wallet → custom 2-option sheet
    if (isMobile && !mobileSheetOpen) {
      return new Promise<string | undefined>((resolve) => {
        connectResolveRef.current = resolve;
        setMobileSheetOpen(true);
      });
    }

    // Desktop / Android / MetaMask in-app → RainbowKit modal
    return new Promise<string | undefined>((resolve) => {
      connectResolveRef.current = resolve;
      openConnectModal?.();
    });
  }, [wagmiAddress, walletAddress, openConnectModal, claimCredits, isMobile, mobileSheetOpen]);

  const disconnectWallet = useCallback(() => {
    disconnect();
    setWalletAddress(null);
    setBalance(null);
    setFreeCallsRemaining(null);
    resetUser();
    document.cookie = "wallet_auth=; path=/; max-age=0";
  }, [disconnect]);

  const switchChain = useCallback(async (chainId: number) => {
    await switchChainAsync({ chainId });
  }, [switchChainAsync]);

  const sendUsdc = useCallback(async (to: string, amountUsdc: number, usdcAddress?: string): Promise<string> => {
    if (!walletAddress || !walletClient) {
      throw new Error("Wallet not connected");
    }

    const usdcContract = usdcAddress ?? USDC_ADDRESS[network];
    // USDC has 6 decimals — amountUsdc is a float like 5.00
    const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000));

    // Encode transfer(address, uint256) calldata
    const paddedTo = to.slice(2).toLowerCase().padStart(64, "0");
    const paddedAmount = amountRaw.toString(16).padStart(64, "0");
    const data = `${TRANSFER_SELECTOR}${paddedTo}${paddedAmount}` as `0x${string}`;

    const txHash = await walletClient.sendTransaction({
      to: usdcContract as `0x${string}`,
      data,
      account: walletAddress as `0x${string}`,
    });

    return txHash;
  }, [walletAddress, walletClient, network]);

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
    <WalletContext.Provider value={{ walletAddress, balance, freeCallsRemaining, lastCreditEvent, clearCreditEvent, network, topUpOpen, setTopUpOpen, spendHistoryOpen, setSpendHistoryOpen, connectWallet, disconnectWallet, refreshBalance, sendUsdc, switchChain, updateFromMetadata, onTopUpCompleteRef, isRestoringSession }}>
      {children}
      <MobileWalletSheet
        open={mobileSheetOpen}
        onOpenChange={handleMobileSheetChange}
        onCoinbaseWallet={handleCbwTap}
      />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
