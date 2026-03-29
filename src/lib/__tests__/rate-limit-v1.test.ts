import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Upstash Redis — not configured (graceful degradation path)
vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(),
}));

// Clear module cache to get fresh state
beforeEach(() => {
  vi.resetModules();
});

describe("rate-limit v1 route keys", () => {
  // Test getRouteKey indirectly via checkRateLimit (since getRouteKey isn't exported)
  // Without Redis configured, all checks return { allowed: true } — so we test that
  // the route detection logic doesn't crash and properly handles all v1 paths.

  it("allows free v1 endpoints without Redis", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit("/api/v1/digest/latest", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("allows tokens endpoint without Redis", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit("/api/v1/tokens/BTC", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("allows paid research endpoints without Redis (graceful degradation)", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit("/api/v1/research/defi-safety", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("allows chat endpoint without Redis", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit("/api/chat", "1.2.3.4");
    expect(result.allowed).toBe(true);
  });
});

describe("rate-limit v1 route key classification", () => {
  // We can't directly test getRouteKey since it's not exported,
  // but we can verify the behavior by checking that research paths
  // are NOT returning "none" (the old behavior that skipped rate limiting).
  // Since Redis is not configured, all paths return allowed: true,
  // so we verify the code doesn't throw for any v1 path variation.

  const v1Paths = [
    "/api/v1/digest/latest",
    "/api/v1/digest/2026-03-28",
    "/api/v1/tokens",
    "/api/v1/tokens/ETH",
    "/api/v1/research/defi-safety",
    "/api/v1/research/whale-activity",
    "/api/v1/research/wallet-portfolio",
    "/api/v1/research/social-narrative",
    "/api/v1/research/token-alpha",
    "/api/v1/research/market-trends",
  ];

  it.each(v1Paths)("handles %s without error", async (path) => {
    const { checkRateLimit } = await import("../rate-limit");
    const result = await checkRateLimit(path, "1.2.3.4");
    expect(result).toHaveProperty("allowed");
  });
});
