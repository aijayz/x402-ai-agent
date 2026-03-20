import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing CreditStore
vi.mock("../db", () => {
  const rows: Record<string, any[]> = {};
  return {
    sql: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");
      return (rows[query] ?? []) as any[];
    }),
    __setMockRows: (q: string, r: any[]) => { rows[q] = r; },
    __clearMockRows: () => { Object.keys(rows).forEach(k => delete rows[k]); },
  };
});

import { CreditStore, MICRO_USDC } from "../credits/credit-store";
import { sql } from "../db";

describe("CreditStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts USDC to microdollars correctly", () => {
    expect(MICRO_USDC(0.50)).toBe(500_000);
    expect(MICRO_USDC(1.00)).toBe(1_000_000);
    expect(MICRO_USDC(0.001)).toBe(1_000);
  });

  it("creates an account with zero balance", async () => {
    (sql as any).mockResolvedValueOnce([{
      wallet_address: "0xABC",
      balance_micro_usdc: 0,
      free_credits_granted: false,
    }]);
    const account = await CreditStore.getOrCreate("0xABC");
    expect(account.walletAddress).toBe("0xABC");
    expect(account.balanceMicroUsdc).toBe(0);
  });

  it("deducts balance atomically and returns new balance", async () => {
    (sql as any).mockResolvedValueOnce([{ balance_micro_usdc: 474_000 }]);
    const result = await CreditStore.deduct("0xABC", 26_000);
    expect(result.success).toBe(true);
    expect(result.newBalanceMicroUsdc).toBe(474_000);
  });

  it("rejects deduction when balance insufficient", async () => {
    (sql as any).mockResolvedValueOnce([]);
    const result = await CreditStore.deduct("0xABC", 1_000_000);
    expect(result.success).toBe(false);
  });
});
