import type { X402ServiceAdapter, X402ServiceResponse } from "../../types";

function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface SLAMaiWalletInput { address: string }

const WALLET_POOL = [
  { massTier: "Whale", iqScore: 92, grade: "A+", tradeCount: 1840, winRate: 0.72, pnl: "$1.2M" },
  { massTier: "Dolphin", iqScore: 65, grade: "B", tradeCount: 340, winRate: 0.54, pnl: "$42K" },
  { massTier: "Fish", iqScore: 38, grade: "C-", tradeCount: 18, winRate: 0.33, pnl: "-$2.1K" },
];

export const slaMaiWalletStub: X402ServiceAdapter<SLAMaiWalletInput, unknown> = {
  name: "SLAMai",
  estimatedCostMicroUsdc: 1_000,
  async call(input: SLAMaiWalletInput): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, WALLET_POOL.length);
    return { data: WALLET_POOL[idx], cost: 1_000, source: "SLAMai (stub)" };
  },
};
