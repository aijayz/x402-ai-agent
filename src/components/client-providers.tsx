"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "./wallet-provider";

export function ClientProviders({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
