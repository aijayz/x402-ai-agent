interface PaymentEvent {
  event: string;
  toolName: string;
  amountUsdc?: number;
  txHash?: string;
  network?: string;
  timestamp: string;
}

export const telemetry = {
  paymentSettled(toolName: string, amountUsdc: number, txHash: string) {
    const event: PaymentEvent = {
      event: "payment_settled",
      toolName,
      amountUsdc,
      txHash,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(event));
  },

  budgetExceeded(toolName: string, requestedUsdc: number, remainingUsdc: number) {
    console.log(
      JSON.stringify({
        event: "budget_exceeded",
        toolName,
        requestedUsdc,
        remainingUsdc,
        timestamp: new Date().toISOString(),
      })
    );
  },
};
