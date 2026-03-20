import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  sql: vi.fn(),
}));

import { SpendEventStore } from "../credits/spend-store";
import { sql } from "../db";

describe("SpendEventStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a spend event with correct parameters", async () => {
    (sql as any).mockResolvedValueOnce([]);
    await SpendEventStore.record({
      walletAddress: "0xABC",
      toolName: "rug_munch_scan",
      serviceCostMicroUsdc: 20_000,
      chargedAmountMicroUsdc: 26_000,
      markupBps: 3000,
      txHash: "0xdef",
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("returns mapped spend events from getRecent", async () => {
    (sql as any).mockResolvedValueOnce([{
      id: 1,
      wallet_address: "0xABC",
      tool_name: "rug_munch_scan",
      service_cost_micro_usdc: 20_000,
      charged_amount_micro_usdc: 26_000,
      markup_bps: 3000,
      tx_hash: "0xdef",
      created_at: "2026-03-20T00:00:00Z",
    }]);
    const events = await SpendEventStore.getRecent("0xABC");
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe("rug_munch_scan");
    expect(events[0].chargedAmountMicroUsdc).toBe(26_000);
  });
});
