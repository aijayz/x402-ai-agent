export const telemetry = {
  paymentSettled(toolName: string, amountUsdc: number, txHash: string) {
    console.log(JSON.stringify({
      event: "payment_settled",
      toolName,
      amountUsdc,
      txHash,
      timestamp: new Date().toISOString(),
    }));
  },

  budgetExceeded(toolName: string, requestedUsdc: number, remainingUsdc: number) {
    console.log(JSON.stringify({
      event: "budget_exceeded",
      toolName,
      requestedUsdc,
      remainingUsdc,
      timestamp: new Date().toISOString(),
    }));
  },

  serviceCall(params: {
    cluster: string;
    service: string;
    latencyMs: number;
    success: boolean;
    costMicroUsdc?: number;
    error?: string;
  }) {
    console.log(JSON.stringify({
      event: "service_call",
      ...params,
      timestamp: new Date().toISOString(),
    }));
  },

  clusterComplete(params: {
    cluster: string;
    tool: string;
    totalLatencyMs: number;
    servicesOk: number;
    servicesFailed: number;
    totalCostMicroUsdc: number;
  }) {
    console.log(JSON.stringify({
      event: "cluster_complete",
      ...params,
      timestamp: new Date().toISOString(),
    }));
  },
};
