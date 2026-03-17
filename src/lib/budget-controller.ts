import { telemetry } from "./telemetry";

interface PaymentRecord {
  toolName: string;
  amountUsdc: number;
  txHash: string;
  timestamp: Date;
}

interface BudgetControllerOptions {
  sessionLimitUsdc: number;
  maxCalls?: number;
  initialCallCount?: number;
  initialSpent?: number;
}

export class BudgetController {
  private spent = 0;
  private history: PaymentRecord[] = [];
  private callCount = 0;
  readonly sessionLimitUsdc: number;
  readonly maxCalls: number;

  constructor(options: BudgetControllerOptions) {
    this.sessionLimitUsdc = options.sessionLimitUsdc;
    this.maxCalls = options.maxCalls ?? Infinity;
    this.spent = options.initialSpent ?? 0;
    this.callCount = options.initialCallCount ?? 0;
  }

  canSpend(amountUsdc: number, toolName = "unknown"): { allowed: boolean; reason?: string } {
    if (this.spent + amountUsdc > this.sessionLimitUsdc) {
      telemetry.budgetExceeded(toolName, amountUsdc, this.remainingUsdc());
      return {
        allowed: false,
        reason: `Session limit of $${this.sessionLimitUsdc.toFixed(2)} would be exceeded (spent: $${this.spent.toFixed(2)}, requested: $${amountUsdc.toFixed(2)})`,
      };
    }
    return { allowed: true };
  }

  canMakeCall(): { allowed: boolean; reason?: string } {
    if (this.callCount >= this.maxCalls) {
      return {
        allowed: false,
        reason: `Session call limit of ${this.maxCalls} exceeded (calls: ${this.callCount})`,
      };
    }
    return { allowed: true };
  }

  recordCall() {
    this.callCount++;
  }

  recordSpend(amountUsdc: number, toolName: string, txHash: string) {
    this.spent += amountUsdc;
    this.history.push({
      toolName,
      amountUsdc,
      txHash,
      timestamp: new Date(),
    });
    telemetry.paymentSettled(toolName, amountUsdc, txHash);
  }

  remainingUsdc(): number {
    return this.sessionLimitUsdc - this.spent;
  }

  remainingCalls(): number {
    return Math.max(0, this.maxCalls - this.callCount);
  }

  getHistory(): ReadonlyArray<PaymentRecord> {
    return this.history;
  }

  getCallCount(): number {
    return this.callCount;
  }
}
