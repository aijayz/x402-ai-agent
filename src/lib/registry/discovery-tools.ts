import { tool } from "ai";
import { z } from "zod";
import { createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RegistryStore } from "./store";

export function createDiscoveryTools(registry: RegistryStore) {
  return {
    search_x402_services: tool({
      description: "Search the registry for x402-enabled APIs that can help with a task",
      inputSchema: z.object({
        query: z.string().describe("What kind of service are you looking for?"),
        categories: z.array(z.string()).optional(),
      }),
      execute: async ({ query, categories }) => {
        const results = registry.search({ query, categories });
        return {
          services: results.map((s) => ({
            id: s.id,
            name: s.name,
            baseUrl: s.baseUrl,
            description: s.description,
            categories: s.categories,
            verified: s.verified,
          })),
        };
      },
    }),

    probe_x402_service: tool({
      description: "Connect to an x402 MCP server to discover its available tools and prices",
      inputSchema: z.object({
        baseUrl: z.string().url(),
        mcpPath: z.string().default("/mcp"),
      }),
      execute: async ({ baseUrl, mcpPath }) => {
        const client = await createMCPClient({
          transport: new StreamableHTTPClientTransport(new URL(mcpPath, baseUrl)),
        });
        try {
          const tools = await client.tools();
          return {
            toolCount: Object.keys(tools).length,
            tools: Object.entries(tools).map(([name, t]) => ({
              name,
              description: (t as { description?: string }).description ?? "No description",
            })),
          };
        } finally {
          await client.close();
        }
      },
    }),

    list_registered_services: tool({
      description: "List all known x402 services in the registry",
      inputSchema: z.object({}),
      execute: async () => ({
        services: registry.listAll().map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          verified: s.verified,
        })),
      }),
    }),
  };
}
