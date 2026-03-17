import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createBudgetTools } from "../tools";
import { BudgetController } from "@/lib/budget-controller";

describe("createBudgetTools", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress telemetry console output from BudgetController
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns a check_budget tool", () => {
    const budget = new BudgetController({ sessionLimitUsdc: 1.0 });
    const tools = createBudgetTools(budget);
    expect(tools.check_budget).toBeDefined();
    expect(tools.check_budget.description).toMatch(/budget/i);
  });

  it("check_budget execute returns correct budget state", async () => {
    const budget = new BudgetController({ sessionLimitUsdc: 1.0 });
    budget.recordSpend(0.3, "tool-a", "0xabc");
    const tools = createBudgetTools(budget);
    const result = await tools.check_budget.execute(
      {},
      { toolCallId: "test-id", messages: [] }
    );
    expect(result.remainingUsdc).toBeCloseTo(0.7);
    expect(result.spentUsdc).toBeCloseTo(0.3);
    expect(result.sessionLimitUsdc).toBe(1.0);
  });

  it("check_budget execute includes payment history", async () => {
    const budget = new BudgetController({ sessionLimitUsdc: 1.0 });
    budget.recordSpend(0.01, "premium_random", "0xdef");
    const tools = createBudgetTools(budget);
    const result = await tools.check_budget.execute(
      {},
      { toolCallId: "test-id", messages: [] }
    );
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({
      toolName: "premium_random",
      amountUsdc: 0.01,
    });
  });

  it("check_budget reflects live budget changes", async () => {
    const budget = new BudgetController({ sessionLimitUsdc: 0.5 });
    const tools = createBudgetTools(budget);

    const before = await tools.check_budget.execute({}, { toolCallId: "1", messages: [] });
    expect(before.remainingUsdc).toBe(0.5);

    budget.recordSpend(0.1, "tool-b", "0x1");

    const after = await tools.check_budget.execute({}, { toolCallId: "2", messages: [] });
    expect(after.remainingUsdc).toBeCloseTo(0.4);
  });
});
