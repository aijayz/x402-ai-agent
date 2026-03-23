import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface SLAMaiWalletInput { address: string }
interface SLAMaiTokenHoldersInput { address: string }

const WALLET_MOCK_POOL = [
  {
    slam: 0.1,
    chain: "base",
    trades: [
      {
        side: "buy",
        usd: 245000,
        base_token: { symbol: "WETH", name: "Wrapped Ether", amount: 100 },
        quote_token: { symbol: "USDC", name: "USD Coin", amount: 245000 },
        trader: {
          address: "0xabc123",
          mass: { tier: "Whale", raw: 92.5 },
          intelligence: { tier: "Genius", iq: 164 },
          reputation: { tier: "A", raw: 88 },
          epoch: { tier: "Early Adopter", raw: 95 },
        },
      },
    ],
  },
  {
    slam: 0.1,
    chain: "base",
    trades: [
      {
        side: "sell",
        usd: 18000,
        base_token: { symbol: "AERO", name: "Aerodrome Finance", amount: 50000 },
        quote_token: { symbol: "USDC", name: "USD Coin", amount: 18000 },
        trader: {
          address: "0xdef456",
          mass: { tier: "Dolphin", raw: 61.2 },
          intelligence: { tier: "Analyst", iq: 112 },
          reputation: { tier: "B+", raw: 73 },
          epoch: { tier: "Established", raw: 70 },
        },
      },
    ],
  },
];

const HOLDER_MOCK_POOL = [
  {
    slam: 0.1,
    chain: "base",
    wallets: [
      { address: "0xabc123", reputation: { tier: "A", depth: "Deep", raw: 91.2 } },
      { address: "0xdef456", reputation: { tier: "B+", depth: "Deep", raw: 74.8 } },
      { address: "0xghi789", reputation: { tier: "C", depth: "Shallow", raw: 52.1 } },
    ],
  },
  {
    slam: 0.1,
    chain: "base",
    wallets: [
      { address: "0xwhale1", reputation: { tier: "A+", depth: "Deep", raw: 97.4 } },
      { address: "0xwhale2", reputation: { tier: "A", depth: "Deep", raw: 88.3 } },
    ],
  },
];

export const slaMaiWalletStub: X402ServiceAdapter<SLAMaiWalletInput, unknown> = {
  name: "SLAMai",
  estimatedCostMicroUsdc: 1_000,
  async call(input: SLAMaiWalletInput, _ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, WALLET_MOCK_POOL.length);
    return { data: WALLET_MOCK_POOL[idx], cost: 1_000, source: "SLAMai (stub)" };
  },
};

export const slaMaiTokenHoldersStub: X402ServiceAdapter<SLAMaiTokenHoldersInput, unknown> = {
  name: "SLAMai Holders",
  estimatedCostMicroUsdc: 1_000,
  async call(input: SLAMaiTokenHoldersInput, _ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, HOLDER_MOCK_POOL.length);
    return { data: HOLDER_MOCK_POOL[idx], cost: 1_000, source: "SLAMai Holders (stub)" };
  },
};
