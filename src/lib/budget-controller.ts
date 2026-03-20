import { telemetry } from "./telemetry";

interface CreditModeOptions {
  mode: "credit";
  walletAddress: string;
  balanceMicroUsdc: number;
}

interface SessionModeOptions {
  mode?: "session";
  sessionLimitUsdc: number;
  maxCalls?: number;
  initialCallCount?: number;
  initialSpent?: number;
}

type BudgetControllerOptions = CreditModeOptions | SessionModeOptions;

export class BudgetController {
  private mode: "session" | "credit";
  // Session mode fields
  private _sessionLimitUsdc: number;
  private _maxCalls: number;
  private callCount: number;
  private spentUsdc: number;
  // Credit mode fields
  private walletAddress: string | null;
  private balanceMicroUsdc: number;
  // Shared
  private history: Array<{ tool: string; amountMicroUsdc: number; txHash?: string }> = [];

  constructor(options: BudgetControllerOptions) {
    if ("mode" in options && options.mode === "credit") {
      this.mode = "credit";
      this.walletAddress = options.walletAddress;
      this.balanceMicroUsdc = options.balanceMicroUsdc;
      this._sessionLimitUsdc = 0;
      this._maxCalls = Infinity;
      this.callCount = 0;
      this.spentUsdc = 0;
    } else {
      this.mode = "session";
      const opts = options as SessionModeOptions;
      this._sessionLimitUsdc = opts.sessionLimitUsdc;
      this._maxCalls = opts.maxCalls ?? Infinity;
      this.callCount = opts.initialCallCount ?? 0;
      this.spentUsdc = opts.initialSpent ?? 0;
      this.walletAddress = null;
      this.balanceMicroUsdc = 0;
    }
  }

  // Public getter for backward compat (tools.ts accesses this)
  get sessionLimitUsdc(): number {
    return this._sessionLimitUsdc;
  }

  get maxCalls(): number {
    return this._maxCalls;
  }

  canSpend(amountMicroUsdc: number): { allowed: boolean; reason?: string } {
    if (this.mode === "credit") {
      if (amountMicroUsdc > this.balanceMicroUsdc) {
        return { allowed: false, reason: "Insufficient credit balance" };
      }
      return { allowed: true };
    }
    // Session mode — check against USD limit
    const amountUsdc = amountMicroUsdc / 1_000_000;
    if (this.spentUsdc + amountUsdc > this._sessionLimitUsdc) {
      telemetry.budgetExceeded("unknown", amountUsdc, this.remainingUsdc());
      return {
        allowed: false,
        reason: `Session limit of $${this._sessionLimitUsdc.toFixed(2)} would be exceeded (spent: $${this.spentUsdc.toFixed(2)}, requested: $${amountUsdc.toFixed(2)})`,
      };
    }
    return { allowed: true };
  }

  recordSpend(amountMicroUsdc: number, toolName: string, txHash?: string): void {
    if (this.mode === "credit") {
      this.balanceMicroUsdc -= amountMicroUsdc;
    } else {
      this.spentUsdc += amountMicroUsdc / 1_000_000;
    }
    this.history.push({ tool: toolName, amountMicroUsdc, txHash });
    telemetry.paymentSettled(toolName, amountMicroUsdc / 1_000_000, txHash ?? "");
  }

  canMakeCall(): { allowed: boolean; reason?: string } {
    if (this.mode === "credit") return { allowed: true };
    if (this.callCount >= this._maxCalls) {
      return {
        allowed: false,
        reason: `Session call limit of ${this._maxCalls} exceeded (calls: ${this.callCount})`,
      };
    }
    return { allowed: true };
  }

  recordCall(): void {
    this.callCount++;
  }

  getCallCount(): number {
    return this.callCount;
  }

  remainingUsdc(): number {
    if (this.mode === "credit") return this.balanceMicroUsdc / 1_000_000;
    return Math.max(0, this._sessionLimitUsdc - this.spentUsdc);
  }

  remainingCalls(): number {
    return Math.max(0, this._maxCalls - this.callCount);
  }

  getHistory(): ReadonlyArray<{ tool: string; amountMicroUsdc: number; txHash?: string }> {
    return this.history;
  }
}
