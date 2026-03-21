import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

/** Simple string hash → index for deterministic mock selection */
function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface DiamondClawsInput { target: string }
interface DiamondClawsOutput {
  tokenSymbol: string;
  holderCount: number;
  top10HolderPercent: number;
  diamondHandsScore: number; // 0-100
  avgHoldDays: number;
  recentLargeTransfers: number;
}

const MOCK_POOL: DiamondClawsOutput[] = [
  {
    tokenSymbol: "UNI", holderCount: 342_100, top10HolderPercent: 0.28,
    diamondHandsScore: 72, avgHoldDays: 145, recentLargeTransfers: 3,
  },
  {
    tokenSymbol: "AAVE", holderCount: 180_400, top10HolderPercent: 0.41,
    diamondHandsScore: 85, avgHoldDays: 210, recentLargeTransfers: 1,
  },
  {
    tokenSymbol: "LINK", holderCount: 620_000, top10HolderPercent: 0.19,
    diamondHandsScore: 91, avgHoldDays: 380, recentLargeTransfers: 0,
  },
  {
    tokenSymbol: "PEPE", holderCount: 95_300, top10HolderPercent: 0.63,
    diamondHandsScore: 22, avgHoldDays: 14, recentLargeTransfers: 47,
  },
];

export const diamondClawsStub: X402ServiceAdapter<DiamondClawsInput, DiamondClawsOutput> = {
  name: "DiamondClaws",
  estimatedCostMicroUsdc: 1_000,
  async call(input: DiamondClawsInput, _ctx: PaymentContext): Promise<X402ServiceResponse<DiamondClawsOutput>> {
    const idx = hashToIndex(input.target, MOCK_POOL.length);
    return { data: MOCK_POOL[idx], cost: 1_000, source: "DiamondClaws (stub)" };
  },
};
