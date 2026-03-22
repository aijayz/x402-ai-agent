import type { WalletClient } from "viem";

export interface PaymentContext {
  walletClient: WalletClient;
  userWallet: string | null;
}

export interface X402ServiceResponse<T = unknown> {
  data: T;
  cost: number; // micro-USDC
  source: string;
  cached?: boolean;
}

export interface X402ServiceAdapter<TInput = unknown, TOutput = unknown> {
  name: string;
  estimatedCostMicroUsdc: number;
  call(input: TInput, ctx: PaymentContext): Promise<X402ServiceResponse<TOutput>>;
}
