import { describe, it, expect } from "vitest";
import { BudgetController } from "../budget-controller";

describe("BudgetController", () => {
  it("allows spend within session limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    expect(bc.canSpend(0.5)).toEqual({ allowed: true });
  });

  it("rejects spend exceeding session limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(0.8, "tool-a", "0xabc");
    expect(bc.canSpend(0.5)).toEqual({
      allowed: false,
      reason: "Session limit of $1.00 would be exceeded (spent: $0.80, requested: $0.50)",
    });
  });

  it("tracks remaining budget", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(0.3, "tool-a", "0xabc");
    expect(bc.remainingUsdc()).toBe(0.7);
  });

  it("records payment history", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(0.01, "premium_random", "0xdef");
    const history = bc.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      toolName: "premium_random",
      amountUsdc: 0.01,
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
