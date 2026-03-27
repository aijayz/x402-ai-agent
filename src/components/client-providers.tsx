"use client";

import "@rainbow-me/rainbowkit/styles.css";
import type { ReactNode } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { createConfig, http, WagmiProvider } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "./wallet-provider";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Use raw wagmi connectors to avoid RainbowKit wallet objects that eagerly
// import WalletConnect (which throws at module evaluation if projectId is empty).
const wagmiConfig = createConfig({
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Obol AI" }),
    // WalletConnect enables MetaMask mobile (stays in Safari) + 300 other wallets.
    // Get a free project ID at https://cloud.walletconnect.com
    ...(projectId ? [walletConnect({ projectId })] : []),
  ],
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletProvider>{children}</WalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
