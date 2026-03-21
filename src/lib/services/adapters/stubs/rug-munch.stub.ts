import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

/** Simple string hash → index for deterministic mock selection */
function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface RugMunchInput { target: string; depth?: "quick" | "full" }
interface RugMunchOutput {
  riskScore: number;
  riskLevel: string;
  flags: string[];
  contractVerified: boolean;
  liquidityLocked: boolean;
  holderConcentration: number;
}

const MOCK_POOL: RugMunchOutput[] = [
  {
    riskScore: 15, riskLevel: "low", flags: [],
    contractVerified: true, liquidityLocked: true, holderConcentration: 0.12,
  },
  {
    riskScore: 45, riskLevel: "medium", flags: ["high-owner-balance", "no-audit"],
    contractVerified: true, liquidityLocked: false, holderConcentration: 0.35,
  },
  {
    riskScore: 82, riskLevel: "high", flags: ["honeypot-risk", "proxy-contract", "concentrated-holders"],
    contractVerified: false, liquidityLocked: false, holderConcentration: 0.68,
  },
  {
    riskScore: 55, riskLevel: "medium", flags: ["mint-function", "no-renounce"],
    contractVerified: true, liquidityLocked: true, holderConcentration: 0.22,
  },
];

export const rugMunchStub: X402ServiceAdapter<RugMunchInput, RugMunchOutput> = {
  name: "RugMunch",
  estimatedCostMicroUsdc: 50_000,
  async call(input: RugMunchInput): Promise<X402ServiceResponse<RugMunchOutput>> {
    const idx = hashToIndex(input.target, MOCK_POOL.length);
    return { data: MOCK_POOL[idx], cost: 50_000, source: "RugMunch (stub)" };
  },
};
