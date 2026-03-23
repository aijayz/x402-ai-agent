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
