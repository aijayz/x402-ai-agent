import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

interface MessariTokenUnlocksInput { target: string }
interface MessariTokenUnlocksOutput {
  found: boolean;
  token?: {
    symbol: string; name: string; slug: string;
    genesisDate: string | null; projectedEndDate: string | null;
    category: string | null; sector: string | null; tags: string[] | null;
  };
  source: string;
}

const MOCK_TOKENS = [
  {
    symbol: "AERO", name: "Aerodrome Finance", slug: "aerodrome-finance",
    genesisDate: "2023-08-03T00:00:00Z", projectedEndDate: "2027-08-03T00:00:00Z",
    category: "Marketplaces", sector: "Exchange",
    tags: ["DeFi", "DEX", "AMM", "Base Ecosystem"],
  },
  {
    symbol: "DEGEN", name: "Degen", slug: "degen",
    genesisDate: "2024-01-15T00:00:00Z", projectedEndDate: null,
    category: "Memes", sector: "Meme",
    tags: ["Farcaster", "Base Ecosystem", "Meme"],
  },
];

export const messariTokenUnlocksStub: X402ServiceAdapter<MessariTokenUnlocksInput, MessariTokenUnlocksOutput> = {
  name: "Messari",
  estimatedCostMicroUsdc: 0,
  async call(input: MessariTokenUnlocksInput, _ctx: PaymentContext): Promise<X402ServiceResponse<MessariTokenUnlocksOutput>> {
    const search = input.target.toLowerCase();
    const match = MOCK_TOKENS.find(t =>
      t.symbol.toLowerCase() === search || t.name.toLowerCase().includes(search)
    );
    return {
      data: { found: !!match, token: match, source: "Messari token-unlocks catalog (stub)" },
      cost: 0,
      source: "Messari",
    };
  },
};

// --- Messari Allocations (paid, x402 v2) ---

interface MessariAllocationsInput { assetSymbol: string }

const MOCK_ALLOCATIONS = [
  {
    assetSymbol: "ARB",
    allocations: [
      { category: "Investors", percentage: 17.53, locked: 8.2, unlocked: 9.33 },
      { category: "Team & Advisors", percentage: 26.94, locked: 15.1, unlocked: 11.84 },
      { category: "DAO Treasury", percentage: 42.78, locked: 42.78, unlocked: 0 },
      { category: "Airdrop", percentage: 12.75, locked: 0, unlocked: 12.75 },
    ],
  },
  {
    assetSymbol: "OP",
    allocations: [
      { category: "Ecosystem Fund", percentage: 25, locked: 12.5, unlocked: 12.5 },
      { category: "Core Contributors", percentage: 19, locked: 10, unlocked: 9 },
      { category: "Investors", percentage: 17, locked: 8, unlocked: 9 },
      { category: "Airdrop", percentage: 19, locked: 0, unlocked: 19 },
      { category: "Governance Fund", percentage: 20, locked: 10, unlocked: 10 },
    ],
  },
];

export const messariAllocationsStub: X402ServiceAdapter<MessariAllocationsInput, unknown> = {
  name: "Messari Allocations",
  estimatedCostMicroUsdc: 250_000,
  async call(input: MessariAllocationsInput, _ctx: PaymentContext): Promise<X402ServiceResponse<unknown>> {
    const match = MOCK_ALLOCATIONS.find(a => a.assetSymbol.toLowerCase() === input.assetSymbol.toLowerCase());
    return {
      data: match ?? { assetSymbol: input.assetSymbol, allocations: [], note: "No allocation data found" },
      cost: 250_000,
      source: "Messari Allocations (stub)",
    };
  },
};
