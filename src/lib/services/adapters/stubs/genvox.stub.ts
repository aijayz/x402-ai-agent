import type { X402ServiceAdapter, X402ServiceResponse } from "../../types";

function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface GenvoxInput { topic: string }

const SENTIMENT_POOL = [
  { sentiment: "bullish", score: 0.82, volume: 14200, trending: true, sources: ["twitter", "reddit", "telegram"] },
  { sentiment: "bearish", score: 0.31, volume: 8400, trending: false, sources: ["twitter", "discord"] },
  { sentiment: "neutral", score: 0.55, volume: 3100, trending: false, sources: ["twitter"] },
];

export const genvoxStub: X402ServiceAdapter<GenvoxInput, unknown> = {
  name: "GenVox",
  estimatedCostMicroUsdc: 30_000,
  async call(input: GenvoxInput): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.topic, SENTIMENT_POOL.length);
    return { data: SENTIMENT_POOL[idx], cost: 30_000, source: "GenVox (stub)" };
  },
};
