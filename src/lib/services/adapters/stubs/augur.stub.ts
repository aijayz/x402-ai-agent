import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

/** Simple string hash → index for deterministic mock selection */
function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface AugurInput { address: string }
interface AugurOutput {
  predictionMarkets: Array<{
    question: string;
    yesPrice: number;
    volume24h: number;
    resolution: string;
  }>;
  overallSentiment: string;
  confidence: number;
}

const MOCK_POOL: AugurOutput[] = [
  {
    predictionMarkets: [
      { question: "Will ETH exceed $5000 by Q2 2026?", yesPrice: 0.62, volume24h: 85_000, resolution: "unresolved" },
      { question: "Will Base TVL exceed $15B by end of month?", yesPrice: 0.45, volume24h: 32_000, resolution: "unresolved" },
    ],
    overallSentiment: "cautiously optimistic", confidence: 0.71,
  },
  {
    predictionMarkets: [
      { question: "Will BTC reach $150k in 2026?", yesPrice: 0.38, volume24h: 210_000, resolution: "unresolved" },
      { question: "Will a major CEX collapse before mid-2026?", yesPrice: 0.12, volume24h: 45_000, resolution: "unresolved" },
      { question: "Will ETH flippening happen in 2026?", yesPrice: 0.08, volume24h: 18_000, resolution: "unresolved" },
    ],
    overallSentiment: "skeptical", confidence: 0.55,
  },
  {
    predictionMarkets: [
      { question: "Will the Fed cut rates before June 2026?", yesPrice: 0.79, volume24h: 520_000, resolution: "unresolved" },
      { question: "Will crypto market cap exceed $5T in 2026?", yesPrice: 0.51, volume24h: 95_000, resolution: "unresolved" },
    ],
    overallSentiment: "bullish macro", confidence: 0.82,
  },
  {
    predictionMarkets: [
      { question: "Will ETH ETF inflows exceed $1B in March 2026?", yesPrice: 0.33, volume24h: 67_000, resolution: "resolved-no" },
      { question: "Will Solana flip Ethereum by TVL in 2026?", yesPrice: 0.21, volume24h: 41_000, resolution: "unresolved" },
    ],
    overallSentiment: "bearish short-term", confidence: 0.63,
  },
];

export const augurStub: X402ServiceAdapter<AugurInput, AugurOutput> = {
  name: "Augur",
  estimatedCostMicroUsdc: 100_000,
  async call(input: AugurInput, _ctx: PaymentContext): Promise<X402ServiceResponse<AugurOutput>> {
    const idx = hashToIndex(input.address, MOCK_POOL.length);
    return { data: MOCK_POOL[idx], cost: 100_000, source: "Augur (stub)" };
  },
};
