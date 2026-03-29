/** Public API v1 response types.
 *  Domain-level signal keys only — no upstream service names. */

// ── Response envelope ────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  endpoint: string;
  summary: string;
  data: T;
  costUsdc: number;
  generatedAt: string;
}

// ── Free tier ────────────────────────────────────────────────────────

export interface DigestResponse {
  date: string;
  title: string;
  content: string;
  markers: unknown[] | null;
  tokenCount: number;
  generatedAt: string;
}

export interface TokenListItem {
  symbol: string;
  category: "fixed" | "mover";
}

export interface TokenListResponse {
  tokens: TokenListItem[];
  snapshotDate: string;
}

export interface TokenSnapshotResponse {
  symbol: string;
  name: string;
  snapshotDate: string;
  security: { score: number; details?: string } | null;
  whaleFlow: {
    netFlowUsd: number;
    largeTxCount: number;
    totalVolumeUsd?: number;
  } | null;
  sentiment: {
    score: number | null;
    label: string | null;
    summary: string | null;
  } | null;
  unlocks: {
    category: string | null;
    sector: string | null;
    projectedEndDate: string | null;
  } | null;
}

// ── Paid tier (research clusters) ────────────────────────────────────

export interface DefiSafetyData {
  security: unknown | null;
  riskAssessment: unknown | null;
  tokenUnlocks: unknown | null;
  onChain: {
    liquidationRisk: unknown | null;
    dexDepth: unknown | null;
  };
}

export interface WhaleActivityData {
  walletRisk: unknown | null;
  whaleMovements: unknown | null;
  recentTrades: unknown | null;
  onChain: {
    whaleFlow: unknown | null;
    smartMoney: unknown | null;
  };
}

export interface WalletPortfolioData {
  walletRisk: unknown | null;
  whaleMovements: unknown | null;
  recentTrades: unknown | null;
  onChain: {
    pnl30d: unknown | null;
  };
}

export interface SocialNarrativeData {
  sentiment: unknown | null;
  riskAssessment: unknown | null;
}

export interface TokenAlphaData {
  security: unknown | null;
  tokenomics: {
    unlocks: unknown | null;
    allocations: unknown | null;
  };
  onChain: {
    smartMoney: unknown | null;
    velocity: unknown | null;
  };
}

export interface MarketTrendsData {
  sentiment: unknown | null;
  onChain: {
    dexVolume: unknown | null;
    stablecoinSupply: unknown | null;
  };
}
