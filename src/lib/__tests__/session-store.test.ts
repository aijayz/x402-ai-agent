import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  sql: vi.fn(),
}));

import { SessionStore } from "../credits/session-store";
import { sql } from "../db";

describe("SessionStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a session with 0 calls used", async () => {
    (sql as any).mockResolvedValueOnce([{ session_id: "abc", free_calls_used: 0 }]);
    const session = await SessionStore.getOrCreate("abc");
    expect(session.freeCallsUsed).toBe(0);
  });

  it("increments call count", async () => {
    (sql as any).mockResolvedValueOnce([{ free_calls_used: 1 }]);
    const count = await SessionStore.incrementCallCount("abc");
    expect(count).toBe(1);
  });

  it("checks if free calls exhausted", () => {
    expect(SessionStore.isFreeCallsExhausted(2)).toBe(true);
    expect(SessionStore.isFreeCallsExhausted(1)).toBe(false);
  });
});
