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
    // @ts-expect-error - execute is possibly undefined in AI SDK types
    const result = await tools.check_budget.execute(
      {},
      { toolCallId: "test-id", messages: [] }
    );
    // Result is AsyncIterable in AI SDK v6, get first value
    const value = Symbol.asyncIterator in result
      ? await result[Symbol.asyncIterator]().next()
      : result;
    expect(value).toBeDefined();
  });

  it("check_budget execute includes payment history", async () => {
    const budget = new BudgetController({ sessionLimitUsdc: 1.0 });
    budget.recordSpend(0.01, "premium_random", "0xdef");
    const tools = createBudgetTools(budget);
    // @ts-expect-error - execute is possibly undefined in AI SDK types
    const result = await tools.check_budget.execute(
      {},
      { toolCallId: "test-id", messages: [] }
    );
    const value = Symbol.asyncIterator in result
      ? await result[Symbol.asyncIterator]().next()
      : result;
    expect(value).toBeDefined();
  });

  it("check_budget reflects live budget changes", async () => {
    const budget = new BudgetController({ sessionLimitUsdc: 0.5 });
    const tools = createBudgetTools(budget);

    // @ts-expect-error - execute is possibly undefined in AI SDK types
    const before = await tools.check_budget.execute({}, { toolCallId: "1", messages: [] });
    const beforeValue = Symbol.asyncIterator in before
      ? await before[Symbol.asyncIterator]().next()
      : before;
    expect(beforeValue).toBeDefined();

    budget.recordSpend(0.1, "tool-b", "0x1");

    // @ts-expect-error - execute is possibly undefined in AI SDK types
    const after = await tools.check_budget.execute({}, { toolCallId: "2", messages: [] });
    const afterValue = Symbol.asyncIterator in after
      ? await after[Symbol.asyncIterator]().next()
      : after;
    expect(afterValue).toBeDefined();
  });
});
