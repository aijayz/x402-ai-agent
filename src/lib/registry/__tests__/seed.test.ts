import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    URL: "http://localhost:3000",
    NETWORK: "base-sepolia",
  },
}));

import { RegistryStore } from "../store";
import { seedRegistry } from "../seed";

describe("seedRegistry", () => {
  it("registers exactly one service", () => {
    const store = new RegistryStore();
    seedRegistry(store);
    expect(store.listAll()).toHaveLength(1);
  });

  it("registers the local MCP server with correct metadata", () => {
    const store = new RegistryStore();
    seedRegistry(store);
    const [service] = store.listAll();
    expect(service).toMatchObject({
      name: "x402 Demo Tools",
      baseUrl: "http://localhost:3000",
      mcpPath: "/mcp",
      categories: expect.arrayContaining(["demo", "math"]),
    });
  });

  it("each call adds a new entry (no deduplication)", () => {
    const store = new RegistryStore();
    seedRegistry(store);
    seedRegistry(store);
    expect(store.listAll()).toHaveLength(2);
  });
});
