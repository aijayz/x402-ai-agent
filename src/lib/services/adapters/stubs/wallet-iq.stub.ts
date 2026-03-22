import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

/** Simple string hash → index for deterministic mock selection */
function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface WalletIQInput { address: string }
interface WalletIQOutput {
  walletType: "whale" | "fund" | "mev-bot" | "retail" | "unknown";
  totalValueUsd: number;
  activeChains: string[];
  topHoldings: Array<{ symbol: string; valueUsd: number }>;
  recentActivity: string;
  riskScore: number;
}

const MOCK_POOL: WalletIQOutput[] = [
  {
    walletType: "whale", totalValueUsd: 4_200_000,
    activeChains: ["ethereum", "base", "arbitrum"],
    topHoldings: [{ symbol: "ETH", valueUsd: 2_100_000 }, { symbol: "USDC", valueUsd: 1_500_000 }],
    recentActivity: "Sold 500 ETH in last 24h", riskScore: 25,
  },
  {
    walletType: "fund", totalValueUsd: 18_500_000,
    activeChains: ["ethereum", "base", "optimism", "polygon"],
    topHoldings: [{ symbol: "WBTC", valueUsd: 8_200_000 }, { symbol: "ETH", valueUsd: 5_600_000 }, { symbol: "USDT", valueUsd: 3_100_000 }],
    recentActivity: "Rebalanced portfolio across 4 chains", riskScore: 15,
  },
  {
    walletType: "mev-bot", totalValueUsd: 320_000,
    activeChains: ["ethereum"],
    topHoldings: [{ symbol: "ETH", valueUsd: 280_000 }, { symbol: "USDC", valueUsd: 40_000 }],
    recentActivity: "Executed 147 sandwich attacks in last 6h", riskScore: 90,
  },
  {
    walletType: "retail", totalValueUsd: 4_800,
    activeChains: ["base"],
    topHoldings: [{ symbol: "ETH", valueUsd: 2_400 }, { symbol: "DEGEN", valueUsd: 1_200 }],
    recentActivity: "Swapped ETH for DEGEN on Aerodrome", riskScore: 55,
  },
];

export const walletIQStub: X402ServiceAdapter<WalletIQInput, WalletIQOutput> = {
  name: "WalletIQ",
  estimatedCostMicroUsdc: 5_000,
  async call(input: WalletIQInput, _ctx: PaymentContext): Promise<X402ServiceResponse<WalletIQOutput>> {
    const idx = hashToIndex(input.address, MOCK_POOL.length);
    return { data: MOCK_POOL[idx], cost: 5_000, source: "WalletIQ (stub)" };
  },
};
