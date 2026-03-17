import type { RegistryStore } from "./store";
import { env } from "@/lib/env";

export function seedRegistry(registry: RegistryStore) {
  // Register our own MCP server as a known service
  registry.register({
    name: "x402 Demo Tools",
    baseUrl: env.URL,
    mcpPath: "/mcp",
    description: "Demo x402 tools: random numbers, math, premium analysis",
    categories: ["demo", "math"],
  });
}
