import { describe, it, expect } from "vitest";
import { BudgetController } from "../budget-controller";

describe("BudgetController", () => {
  it("allows spend within session limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    expect(bc.canSpend(500_000)).toEqual({ allowed: true });
  });

  it("rejects spend exceeding session limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(800_000, "tool-a", "0xabc");
    expect(bc.canSpend(500_000)).toEqual({
      allowed: false,
      reason: "Session limit of $1.00 would be exceeded (spent: $0.80, requested: $0.50)",
    });
  });

  it("tracks remaining budget", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(300_000, "tool-a", "0xabc");
    expect(bc.remainingUsdc()).toBeCloseTo(0.7);
  });

  it("records payment history", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(10_000, "premium_random", "0xdef");
    const history = bc.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      tool: "premium_random",
      amountMicroUsdc: 10_000,
      txHash: "0xdef",
    });
  });

  it("allows calls within limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0, maxCalls: 5 });
    expect(bc.canMakeCall()).toEqual({ allowed: true });
    bc.recordCall();
    bc.recordCall();
    expect(bc.remainingCalls()).toBe(3);
  });

  it("rejects calls exceeding limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0, maxCalls: 2 });
    bc.recordCall();
    bc.recordCall();
    expect(bc.canMakeCall()).toEqual({
      allowed: false,
      reason: "Session call limit of 2 exceeded (calls: 2)",
    });
  });

  it("defaults to unlimited calls when not specified", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    expect(bc.canMakeCall()).toEqual({ allowed: true });
    bc.recordCall();
    bc.recordCall();
    expect(bc.remainingCalls()).toBe(Infinity);
  });
});

describe("BudgetController — credit mode", () => {
  it("allows spend within balance", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 500_000, // $0.50
    });
    const check = bc.canSpend(100_000); // $0.10
    expect(check.allowed).toBe(true);
    expect(bc.remainingUsdc()).toBeCloseTo(0.5);
  });

  it("rejects spend exceeding balance", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 50_000, // $0.05
    });
    const check = bc.canSpend(100_000); // $0.10
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Insufficient");
  });

  it("tracks remaining balance after recordSpend", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 500_000,
    });
    bc.recordSpend(100_000, "test_tool", "0xtx1");
    expect(bc.remainingUsdc()).toBeCloseTo(0.4);
    bc.recordSpend(200_000, "test_tool_2", "0xtx2");
    expect(bc.remainingUsdc()).toBeCloseTo(0.2);
  });

  it("has no call limit in credit mode", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 1_000_000,
    });
    for (let i = 0; i < 10; i++) {
      expect(bc.canMakeCall().allowed).toBe(true);
      bc.recordCall();
    }
  });
});
