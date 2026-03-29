import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────

const mockGetLatestDigest = vi.fn();
const mockGetDigestByDate = vi.fn();
vi.mock("@/lib/reports/report-store", () => ({
  ReportStore: {
    getLatestDigest: (...args: unknown[]) => mockGetLatestDigest(...args),
    getDigestByDate: (...args: unknown[]) => mockGetDigestByDate(...args),
  },
}));

const mockGetAllSymbols = vi.fn();
const mockGetBySymbol = vi.fn();
const mockGetLatestSnapshotDate = vi.fn();
vi.mock("@/lib/token-pages/store", () => ({
  TokenSnapshotStore: {
    getAllSymbols: (...args: unknown[]) => mockGetAllSymbols(...args),
    getBySymbol: (...args: unknown[]) => mockGetBySymbol(...args),
    getLatestSnapshotDate: (...args: unknown[]) => mockGetLatestSnapshotDate(...args),
  },
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { GET as getLatest } from "../../v1/digest/latest/route";
import { GET as getByDate } from "../../v1/digest/[date]/route";
import { GET as getTokens } from "../../v1/tokens/route";
import { GET as getTokenSymbol } from "../../v1/tokens/[symbol]/route";

// ── Helpers ─────────────────────────────────────────────────────────

const fakeDigest = {
  id: "abc123",
  walletAddress: null,
  title: "Daily Intelligence Digest — March 28, 2026",
  content: "## Market Overview\nBTC up.",
  markers: [{ type: "metric", label: "BTC", value: "$94,000", change: "+1.2%" }],
  metadata: null,
  type: "digest" as const,
  digestDate: "2026-03-28",
  createdAt: "2026-03-28T00:05:12Z",
  expiresAt: null,
};

const fakeSnapshot = {
  id: "snap1",
  symbol: "BTC",
  data: {
    name: "Bitcoin",
    price: 94000,
    change24h: 1.2,
    marketCap: 1_800_000_000_000,
    security: { score: 95, details: "No known vulnerabilities" },
    whaleFlow: { netFlowUsd: -12_400_000, largeTxCount: 847, totalVolumeUsd: 89_000_000 },
    sentiment: { score: 68, label: "bullish", summary: "Institutional accumulation" },
    unlocks: null,
  },
  digestDate: "2026-03-28",
  createdAt: "2026-03-28T00:05:12Z",
  updatedAt: "2026-03-28T00:05:12Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/v1/digest/latest ───────────────────────────────────────

describe("GET /api/v1/digest/latest", () => {
  it("returns the latest digest", async () => {
    mockGetLatestDigest.mockResolvedValue(fakeDigest);
    const res = await getLatest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-03-28");
    expect(body.title).toContain("March 28");
    expect(body.content).toContain("Market Overview");
    expect(body.tokenCount).toBe(1);
    expect(body.generatedAt).toBe("2026-03-28T00:05:12Z");
  });

  it("strips internal fields (id, walletAddress, expiresAt)", async () => {
    mockGetLatestDigest.mockResolvedValue(fakeDigest);
    const res = await getLatest();
    const body = await res.json();
    expect(body.id).toBeUndefined();
    expect(body.walletAddress).toBeUndefined();
    expect(body.expiresAt).toBeUndefined();
    expect(body.type).toBeUndefined();
  });

  it("returns 404 when no digest exists", async () => {
    mockGetLatestDigest.mockResolvedValue(null);
    const res = await getLatest();
    expect(res.status).toBe(404);
  });

  it("sets Cache-Control header", async () => {
    mockGetLatestDigest.mockResolvedValue(fakeDigest);
    const res = await getLatest();
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });
});

// ── GET /api/v1/digest/[date] ───────────────────────────────────────

describe("GET /api/v1/digest/[date]", () => {
  const makeReq = (date: string) => new Request(`http://localhost/api/v1/digest/${date}`);

  it("returns digest for a valid date", async () => {
    mockGetDigestByDate.mockResolvedValue(fakeDigest);
    const res = await getByDate(makeReq("2026-03-28"), { params: Promise.resolve({ date: "2026-03-28" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-03-28");
  });

  it("returns 400 for invalid date format", async () => {
    const res = await getByDate(makeReq("March-28"), { params: Promise.resolve({ date: "March-28" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("YYYY-MM-DD");
  });

  it("returns 404 when digest not found", async () => {
    mockGetDigestByDate.mockResolvedValue(null);
    const res = await getByDate(makeReq("2020-01-01"), { params: Promise.resolve({ date: "2020-01-01" }) });
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/tokens ──────────────────────────────────────────────

describe("GET /api/v1/tokens", () => {
  it("returns token list with category annotations", async () => {
    mockGetAllSymbols.mockResolvedValue(["BTC", "ETH", "SIREN"]);
    mockGetLatestSnapshotDate.mockResolvedValue("2026-03-28");
    const res = await getTokens();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toEqual([
      { symbol: "BTC", category: "fixed" },
      { symbol: "ETH", category: "fixed" },
      { symbol: "SIREN", category: "mover" },
    ]);
    expect(body.snapshotDate).toBe("2026-03-28");
  });

  it("falls back to today when no snapshots exist", async () => {
    mockGetAllSymbols.mockResolvedValue([]);
    mockGetLatestSnapshotDate.mockResolvedValue(null);
    const res = await getTokens();
    const body = await res.json();
    expect(body.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── GET /api/v1/tokens/[symbol] ─────────────────────────────────────

describe("GET /api/v1/tokens/[symbol]", () => {
  const makeReq = (sym: string) => new Request(`http://localhost/api/v1/tokens/${sym}`);

  it("returns snapshot with domain-level fields", async () => {
    mockGetBySymbol.mockResolvedValue(fakeSnapshot);
    const res = await getTokenSymbol(makeReq("BTC"), { params: Promise.resolve({ symbol: "BTC" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.symbol).toBe("BTC");
    expect(body.name).toBe("Bitcoin");
    expect(body.snapshotDate).toBe("2026-03-28");
    expect(body.security).toEqual({ score: 95, details: "No known vulnerabilities" });
    expect(body.whaleFlow.netFlowUsd).toBe(-12_400_000);
    expect(body.sentiment.label).toBe("bullish");
  });

  it("strips internal fields (id, price, change24h, marketCap)", async () => {
    mockGetBySymbol.mockResolvedValue(fakeSnapshot);
    const res = await getTokenSymbol(makeReq("BTC"), { params: Promise.resolve({ symbol: "BTC" }) });
    const body = await res.json();
    expect(body.id).toBeUndefined();
    expect(body.price).toBeUndefined();
    expect(body.change24h).toBeUndefined();
    expect(body.marketCap).toBeUndefined();
  });

  it("returns 404 for unknown symbol", async () => {
    mockGetBySymbol.mockResolvedValue(null);
    const res = await getTokenSymbol(makeReq("FAKE"), { params: Promise.resolve({ symbol: "FAKE" }) });
    expect(res.status).toBe(404);
  });

  it("handles null optional fields", async () => {
    mockGetBySymbol.mockResolvedValue({
      ...fakeSnapshot,
      data: { ...fakeSnapshot.data, security: null, whaleFlow: null, sentiment: null, unlocks: null },
    });
    const res = await getTokenSymbol(makeReq("BTC"), { params: Promise.resolve({ symbol: "BTC" }) });
    const body = await res.json();
    expect(body.security).toBeNull();
    expect(body.whaleFlow).toBeNull();
    expect(body.sentiment).toBeNull();
    expect(body.unlocks).toBeNull();
  });

  it("parses sentiment label from summary when label is null", async () => {
    mockGetBySymbol.mockResolvedValue({
      ...fakeSnapshot,
      data: {
        ...fakeSnapshot.data,
        sentiment: { score: 72, label: null, summary: "Overall sentiment is BULLISH amid rising volumes" },
      },
    });
    const res = await getTokenSymbol(makeReq("BTC"), { params: Promise.resolve({ symbol: "BTC" }) });
    const body = await res.json();
    expect(body.sentiment.label).toBe("bullish");
  });

  it("preserves sentiment label when already set", async () => {
    mockGetBySymbol.mockResolvedValue({
      ...fakeSnapshot,
      data: {
        ...fakeSnapshot.data,
        sentiment: { score: 30, label: "bearish", summary: "Market is turning bearish" },
      },
    });
    const res = await getTokenSymbol(makeReq("BTC"), { params: Promise.resolve({ symbol: "BTC" }) });
    const body = await res.json();
    expect(body.sentiment.label).toBe("bearish");
  });
});
