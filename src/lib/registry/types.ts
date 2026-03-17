export interface X402Service {
  id: string;
  name: string;
  baseUrl: string;
  mcpPath: string;
  description: string;
  categories: string[];
  verified: boolean;
  createdAt: Date;
}

export interface X402ServiceTool {
  id: string;
  serviceId: string;
  toolName: string;
  priceUsdc: number;
  description: string;
  inputSchema: Record<string, unknown>;
  lastSeen: Date;
}
