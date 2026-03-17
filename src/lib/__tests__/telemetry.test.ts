import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { telemetry } from "../telemetry";

describe("telemetry", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("paymentSettled", () => {
    it("emits a payment_settled JSON event", () => {
      telemetry.paymentSettled("premium_random", 0.01, "0xabc123");
      expect(consoleSpy).toHaveBeenCalledOnce();
      const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(logged).toMatchObject({
        event: "payment_settled",
        toolName: "premium_random",
        amountUsdc: 0.01,
        txHash: "0xabc123",
      });
    });

    it("includes a valid ISO timestamp", () => {
      telemetry.paymentSettled("tool", 0.01, "0x1");
      const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(() => new Date(logged.timestamp)).not.toThrow();
      expect(new Date(logged.timestamp).getFullYear()).toBeGreaterThan(2020);
    });
  });

  describe("budgetExceeded", () => {
    it("emits a budget_exceeded JSON event", () => {
      telemetry.budgetExceeded("premium_analysis", 0.02, 0.05);
      expect(consoleSpy).toHaveBeenCalledOnce();
      const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(logged).toMatchObject({
        event: "budget_exceeded",
        toolName: "premium_analysis",
        requestedUsdc: 0.02,
        remainingUsdc: 0.05,
      });
    });

    it("includes a valid ISO timestamp", () => {
      telemetry.budgetExceeded("tool", 0.01, 0.0);
      const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(() => new Date(logged.timestamp)).not.toThrow();
    });
  });
});
