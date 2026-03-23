import { env } from "../../env";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

const MESSARI_BASE = env.MESSARI_URL ?? "https://api.messari.io";

interface MessariTokenUnlocksInput {
  target: string; // token name, symbol, or slug
}

interface TokenUnlockEntry {
  symbol: string;
  name: string;
  slug: string;
  genesisDate: string | null;
  projectedEndDate: string | null;
  category: string | null;
  sector: string | null;
  tags: string[] | null;
}

interface MessariTokenUnlocksOutput {
  found: boolean;
  token?: TokenUnlockEntry;
  source: string;
}

/**
 * Messari token unlock catalog — free endpoint, no x402 payment required.
 * Returns Messari's institutional classification (category, sector, tags,
 * genesis date) and unlock schedule for a token, if known.
 */
export const messariTokenUnlocksAdapter: X402ServiceAdapter<MessariTokenUnlocksInput, MessariTokenUnlocksOutput> = {
  name: "Messari",
  estimatedCostMicroUsdc: 0,
  async call(input: MessariTokenUnlocksInput, _ctx: PaymentContext): Promise<X402ServiceResponse<MessariTokenUnlocksOutput>> {
    const res = await fetch(`${MESSARI_BASE}/token-unlocks/v1/assets`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Messari token-unlocks returned ${res.status}`);
    }

    const body = await res.json() as { data?: TokenUnlockEntry[] };
    const tokens: TokenUnlockEntry[] = body.data ?? [];

    // Case-insensitive match on symbol, name, or slug
    const search = input.target.toLowerCase().replace(/^0x[0-9a-f]+$/i, ""); // skip if raw address
    const match = search
      ? tokens.find(t =>
          t.symbol?.toLowerCase() === search ||
          t.name?.toLowerCase() === search ||
          t.slug?.toLowerCase() === search ||
          t.name?.toLowerCase().includes(search) ||
          t.symbol?.toLowerCase().includes(search)
        )
      : undefined;

    return {
      data: {
        found: !!match,
        token: match,
        source: "Messari token-unlocks catalog",
      },
      cost: 0,
      source: "Messari",
    };
  },
};
