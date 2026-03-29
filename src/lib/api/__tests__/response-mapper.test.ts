import { describe, it, expect } from "vitest";
import type { ClusterResult, ServiceCallResult } from "@/lib/clusters/types";
import {
  wrapResponse,
  mapDefiSafetyResponse,
  mapWhaleActivityResponse,
  mapWalletPortfolioResponse,
  mapSocialNarrativeResponse,
  mapTokenAlphaResponse,
  mapMarketTrendsResponse,
} from "../response-mapper";

function makeCall(serviceName: string, data: unknown, cost = 0): ServiceCallResult {
  return { serviceName, data, costMicroUsdc: cost, paid: cost > 0 };
}

function makeResult(calls: ServiceCallResult[]): ClusterResult {
  return { summary: "test", serviceCalls: calls, totalCostMicroUsdc: calls.reduce((s, c) => s + c.costMicroUsdc, 0) };
}

// ── wrapResponse ────────────────────────────────────────────────────

describe("wrapResponse", () => {
  it("creates correct envelope with cost conversion", () => {
    const res = wrapResponse("test-endpoint", "A summary", { foo: 1 }, 110_000);
    expect(res.endpoint).toBe("test-endpoint");
    expect(res.summary).toBe("A summary");
    expect(res.data).toEqual({ foo: 1 });
    expect(res.costUsdc).toBe(0.11);
    expect(res.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles zero cost", () => {
    const res = wrapResponse("free", "Free", {}, 0);
    expect(res.costUsdc).toBe(0);
  });
});

// ── Cluster A: DeFi Safety ──────────────────────────────────────────

describe("mapDefiSafetyResponse", () => {
  it("maps services to domain keys", () => {
    const result = makeResult([
      makeCall("QuantumShield Token Security", { score: 85 }, 1000),
      makeCall("Augur Risk Assessment", { risk: "low" }, 100_000),
      makeCall("Messari Token Unlocks", { nextUnlock: "2026-06-01" }),
      makeCall("Dune Analytics (temporal)", { liquidation_risk: [{ val: 1 }], dex_pair_depth: [{ val: 2 }] }),
    ]);
    const data = mapDefiSafetyResponse(result);
    expect(data.security).toEqual({ score: 85 });
    expect(data.riskAssessment).toEqual({ risk: "low" });
    expect(data.tokenUnlocks).toEqual({ nextUnlock: "2026-06-01" });
    expect(data.onChain.liquidationRisk).toEqual([{ val: 1 }]);
    expect(data.onChain.dexDepth).toEqual([{ val: 2 }]);
  });

  it("returns nulls for missing services", () => {
    const data = mapDefiSafetyResponse(makeResult([]));
    expect(data.security).toBeNull();
    expect(data.riskAssessment).toBeNull();
    expect(data.tokenUnlocks).toBeNull();
    expect(data.onChain.liquidationRisk).toBeNull();
    expect(data.onChain.dexDepth).toBeNull();
  });
});

// ── Cluster B: Whale Activity ───────────────────────────────────────

describe("mapWhaleActivityResponse", () => {
  it("maps services to domain keys", () => {
    const result = makeResult([
      makeCall("QuantumShield Wallet Risk", { riskLevel: "medium" }, 1000),
      makeCall("QuantumShield Whale Activity", { movements: 12 }, 3000),
      makeCall("SLAMai Wallet Trades", { trades: [] }, 1000),
      makeCall("Dune Analytics (temporal)", {
        whale_flow_ethereum: [{ flow: 100 }],
        smart_money_moves_7d: [{ move: "buy" }],
      }),
    ]);
    const data = mapWhaleActivityResponse(result);
    expect(data.walletRisk).toEqual({ riskLevel: "medium" });
    expect(data.whaleMovements).toEqual({ movements: 12 });
    expect(data.recentTrades).toEqual({ trades: [] });
    expect(data.onChain.whaleFlow).toEqual([{ flow: 100 }]);
    expect(data.onChain.smartMoney).toEqual([{ move: "buy" }]);
  });
});

// ── Cluster C: Wallet Portfolio ─────────────────────────────────────

describe("mapWalletPortfolioResponse", () => {
  it("maps SLAMai to recentTrades and QS Whale to holdings", () => {
    const result = makeResult([
      makeCall("QuantumShield Wallet Risk", { riskLevel: "low" }, 1000),
      makeCall("SLAMai Wallet Trades", { trades: [{ tx: "0x1" }] }, 1000),
      makeCall("QuantumShield Whale Activity", { holdings: ["ETH", "USDC"] }, 3000),
    ]);
    const data = mapWalletPortfolioResponse(result);
    expect(data.walletRisk).toEqual({ riskLevel: "low" });
    // SLAMai → recentTrades (trade history)
    expect(data.recentTrades).toEqual({ trades: [{ tx: "0x1" }] });
    // QS Whale Activity → holdings (whale movements as holdings proxy)
    expect(data.holdings).toEqual({ holdings: ["ETH", "USDC"] });
  });
});

// ── Cluster D: Social Narrative ─────────────────────────────────────

describe("mapSocialNarrativeResponse", () => {
  it("maps sentiment and risk", () => {
    const result = makeResult([
      makeCall("GenVox Sentiment Analysis", { score: 72, label: "bullish" }, 30_000),
      makeCall("Augur Risk Assessment", { risk: "moderate" }, 100_000),
    ]);
    const data = mapSocialNarrativeResponse(result);
    expect(data.sentiment).toEqual({ score: 72, label: "bullish" });
    expect(data.riskAssessment).toEqual({ risk: "moderate" });
  });
});

// ── Cluster E: Token Alpha ──────────────────────────────────────────

describe("mapTokenAlphaResponse", () => {
  it("maps security, tokenomics, and on-chain data", () => {
    const result = makeResult([
      makeCall("QuantumShield Token Security", { score: 90 }, 1000),
      makeCall("Messari Token Unlocks", { schedule: [] }),
      makeCall("Messari Allocations", { breakdown: {} }, 250_000),
      makeCall("Dune Analytics (temporal)", {
        smart_money_moves_7d: [{ action: "accumulate" }],
        token_velocity: [{ v: 3.2 }],
      }),
    ]);
    const data = mapTokenAlphaResponse(result);
    expect(data.security).toEqual({ score: 90 });
    expect(data.tokenomics.unlocks).toEqual({ schedule: [] });
    expect(data.tokenomics.allocations).toEqual({ breakdown: {} });
    expect(data.onChain.smartMoney).toEqual([{ action: "accumulate" }]);
    expect(data.onChain.velocity).toEqual([{ v: 3.2 }]);
  });
});

// ── Cluster F: Market Trends ────────────────────────────────────────

describe("mapMarketTrendsResponse", () => {
  it("maps sentiment and on-chain data", () => {
    const result = makeResult([
      makeCall("GenVox Sentiment Analysis", { score: 55 }, 30_000),
      makeCall("Dune Analytics (temporal)", {
        dex_volume_7d: [{ vol: 1_000_000 }],
        stablecoin_supply_trend: [{ supply: 50_000_000 }],
      }),
    ]);
    const data = mapMarketTrendsResponse(result);
    expect(data.sentiment).toEqual({ score: 55 });
    expect(data.onChain.dexVolume).toEqual([{ vol: 1_000_000 }]);
    expect(data.onChain.stablecoinSupply).toEqual([{ supply: 50_000_000 }]);
  });
});

// ── No upstream service names leak ──────────────────────────────────

describe("response abstraction", () => {
  const UPSTREAM_NAMES = ["augur", "quantumshield", "genvox", "slamai", "messari", "dune"];

  it("domain keys never contain upstream service names", () => {
    const result = makeResult([
      makeCall("Augur Risk Assessment", { risk: "low" }, 100_000),
      makeCall("GenVox Sentiment Analysis", { score: 72 }, 30_000),
      makeCall("QuantumShield Token Security", { score: 85 }, 1000),
      makeCall("SLAMai Wallet Trades", { trades: [] }, 1000),
      makeCall("Messari Token Unlocks", { next: "2026-06" }),
    ]);

    const mappers = [
      mapDefiSafetyResponse,
      mapWhaleActivityResponse,
      mapWalletPortfolioResponse,
      mapSocialNarrativeResponse,
      mapTokenAlphaResponse,
      mapMarketTrendsResponse,
    ];

    for (const mapper of mappers) {
      const data = mapper(result);
      const keys = JSON.stringify(Object.keys(data));
      for (const name of UPSTREAM_NAMES) {
        expect(keys.toLowerCase()).not.toContain(name);
      }
    }
  });
});
