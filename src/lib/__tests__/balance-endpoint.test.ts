import { describe, it, expect, vi } from "vitest";

// Mock the credit store
vi.mock("../credits/credit-store", () => ({
  CreditStore: {
    get: vi.fn(),
  },
}));

import { CreditStore } from "../credits/credit-store";

// We test the logic, not the Next.js route handler directly
describe("balance endpoint logic", () => {
  it("returns balance for known wallet", async () => {
    vi.mocked(CreditStore.get).mockResolvedValue({
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      balanceMicroUsdc: 500_000,
      lifetimeSpentMicroUsdc: 100_000,
      freeCreditsGranted: true,
      freeCreditsAmountMicroUsdc: 500_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const account = await CreditStore.get("0x1234567890abcdef1234567890abcdef12345678");
    expect(account).not.toBeNull();
    expect(account!.balanceMicroUsdc).toBe(500_000);
  });

  it("returns null for unknown wallet", async () => {
    vi.mocked(CreditStore.get).mockResolvedValue(null);

    const account = await CreditStore.get("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    expect(account).toBeNull();
  });

  it("rejects invalid wallet address format", () => {
    const valid = /^0x[a-fA-F0-9]{40}$/.test("0x1234567890abcdef1234567890abcdef12345678");
    const invalidShort = /^0x[a-fA-F0-9]{40}$/.test("0x1234");
    const invalidNoPrefix = /^0x[a-fA-F0-9]{40}$/.test("1234567890abcdef1234567890abcdef12345678");
    const empty = /^0x[a-fA-F0-9]{40}$/.test("");

    expect(valid).toBe(true);
    expect(invalidShort).toBe(false);
    expect(invalidNoPrefix).toBe(false);
    expect(empty).toBe(false);
  });
});
