/** Transform raw ClusterResult into public API responses.
 *  Maps internal service names to domain-level signal keys. */

import type { ClusterResult, ServiceCallResult } from "@/lib/clusters/types";
import type {
  ApiResponse,
  DefiSafetyData,
  WhaleActivityData,
  WalletPortfolioData,
  SocialNarrativeData,
  TokenAlphaData,
  MarketTrendsData,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

function findService(calls: ServiceCallResult[], ...patterns: string[]): unknown | null {
  for (const pattern of patterns) {
    const call = calls.find((c) => c.serviceName.toLowerCase().includes(pattern.toLowerCase()));
    if (call) return call.data;
  }
  return null;
}

function findDuneField(calls: ServiceCallResult[], field: string): unknown | null {
  const dune = calls.find((c) => c.serviceName.toLowerCase().includes("dune"));
  if (!dune || typeof dune.data !== "object" || dune.data === null) return null;
  return (dune.data as Record<string, unknown>)[field] ?? null;
}

export function wrapResponse<T>(endpoint: string, summary: string, data: T, costMicro: number): ApiResponse<T> {
  return {
    endpoint,
    summary,
    data,
    costUsdc: Number((costMicro / 1_000_000).toFixed(6)),
    generatedAt: new Date().toISOString(),
  };
}

// ── Cluster A: DeFi Safety ───────────────────────────────────────────

export function mapDefiSafetyResponse(result: ClusterResult): DefiSafetyData {
  const { serviceCalls } = result;
  return {
    security: findService(serviceCalls, "token security", "security"),
    riskAssessment: findService(serviceCalls, "augur", "risk"),
    tokenUnlocks: findService(serviceCalls, "unlock", "messari"),
    onChain: {
      liquidationRisk: findDuneField(serviceCalls, "liquidation_risk"),
      dexDepth: findDuneField(serviceCalls, "dex_pair_depth"),
    },
  };
}

// ── Cluster B: Whale Activity ────────────────────────────────────────

export function mapWhaleActivityResponse(result: ClusterResult): WhaleActivityData {
  const { serviceCalls } = result;
  return {
    walletRisk: findService(serviceCalls, "wallet risk", "risk"),
    whaleMovements: findService(serviceCalls, "whale activity", "whale"),
    recentTrades: findService(serviceCalls, "wallet trades", "slamai", "trade"),
    onChain: {
      whaleFlow: findDuneField(serviceCalls, "whale_flow_ethereum"),
      smartMoney: findDuneField(serviceCalls, "smart_money_moves_7d"),
    },
  };
}

// ── Cluster C: Wallet Portfolio ──────────────────────────────────────

export function mapWalletPortfolioResponse(result: ClusterResult): WalletPortfolioData {
  const { serviceCalls } = result;
  return {
    walletRisk: findService(serviceCalls, "wallet risk", "risk"),
    holdings: findService(serviceCalls, "whale activity", "whale"),
    recentTrades: findService(serviceCalls, "wallet trades", "slamai", "trade"),
    onChain: {
      pnl30d: findDuneField(serviceCalls, "wallet_pnl_30d"),
    },
  };
}

// ── Cluster D: Social Narrative ──────────────────────────────────────

export function mapSocialNarrativeResponse(result: ClusterResult): SocialNarrativeData {
  const { serviceCalls } = result;
  return {
    sentiment: findService(serviceCalls, "sentiment", "genvox"),
    riskAssessment: findService(serviceCalls, "augur", "wallet risk", "risk"),
  };
}

// ── Cluster E: Token Alpha ───────────────────────────────────────────

export function mapTokenAlphaResponse(result: ClusterResult): TokenAlphaData {
  const { serviceCalls } = result;
  return {
    security: findService(serviceCalls, "token security", "security"),
    tokenomics: {
      unlocks: findService(serviceCalls, "unlock"),
      allocations: findService(serviceCalls, "allocation"),
    },
    onChain: {
      smartMoney: findDuneField(serviceCalls, "smart_money_moves_7d"),
      velocity: findDuneField(serviceCalls, "token_velocity"),
    },
  };
}

// ── Cluster F: Market Trends ─────────────────────────────────────────

export function mapMarketTrendsResponse(result: ClusterResult): MarketTrendsData {
  const { serviceCalls } = result;
  return {
    sentiment: findService(serviceCalls, "sentiment", "genvox"),
    onChain: {
      dexVolume: findDuneField(serviceCalls, "dex_volume_7d"),
      stablecoinSupply: findDuneField(serviceCalls, "stablecoin_supply_trend"),
    },
  };
}
