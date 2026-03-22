import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

/** Simple string hash → index for deterministic mock selection */
function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface GenVoxInput { topic: string }
interface GenVoxOutput {
  sentimentScore: number; // -100 to 100
  sentimentLabel: string;
  trendingNarratives: string[];
  topMentions: Array<{ source: string; text: string }>;
  volumeChange24h: number;
}

const MOCK_POOL: GenVoxOutput[] = [
  {
    sentimentScore: 65, sentimentLabel: "bullish",
    trendingNarratives: ["Base ecosystem growth", "L2 summer narrative"],
    topMentions: [
      { source: "twitter", text: "Base TVL just hit $10B" },
      { source: "farcaster", text: "Onchain summer 2.0 incoming" },
    ],
    volumeChange24h: 42.5,
  },
  {
    sentimentScore: -58, sentimentLabel: "bearish",
    trendingNarratives: ["Macro uncertainty", "Fed rate fears", "Crypto winter FUD"],
    topMentions: [
      { source: "twitter", text: "BTC rejected at key resistance again" },
      { source: "reddit", text: "Why I'm sitting in stables until Q3" },
    ],
    volumeChange24h: -31.2,
  },
  {
    sentimentScore: 5, sentimentLabel: "neutral",
    trendingNarratives: ["Sideways price action", "Accumulation phase"],
    topMentions: [
      { source: "farcaster", text: "Market waiting for macro catalysts" },
      { source: "twitter", text: "Low volatility could precede big move either way" },
    ],
    volumeChange24h: 2.1,
  },
  {
    sentimentScore: -20, sentimentLabel: "mixed",
    trendingNarratives: ["Altcoin divergence", "BTC dominance rising", "DeFi TVL holding"],
    topMentions: [
      { source: "twitter", text: "BTC strong but alts bleeding" },
      { source: "discord", text: "DeFi metrics still healthy despite price action" },
    ],
    volumeChange24h: -8.7,
  },
];

export const genVoxStub: X402ServiceAdapter<GenVoxInput, GenVoxOutput> = {
  name: "GenVox",
  estimatedCostMicroUsdc: 30_000,
  async call(input: GenVoxInput, _ctx: PaymentContext): Promise<X402ServiceResponse<GenVoxOutput>> {
    const idx = hashToIndex(input.topic, MOCK_POOL.length);
    return { data: MOCK_POOL[idx], cost: 30_000, source: "GenVox (stub)" };
  },
};
