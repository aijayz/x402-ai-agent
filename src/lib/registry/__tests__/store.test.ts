import { describe, it, expect, beforeEach } from "vitest";
import { RegistryStore } from "../store";

describe("RegistryStore", () => {
  let store: RegistryStore;

  beforeEach(() => {
    store = new RegistryStore();
  });

  it("registers and retrieves a service", () => {
    const service = store.register({
      name: "Weather API",
      baseUrl: "https://weather.example.com",
      mcpPath: "/mcp",
      description: "Real-time weather data",
      categories: ["weather"],
    });
    expect(store.getById(service.id)).toMatchObject({ name: "Weather API" });
  });

  it("searches by category", () => {
    store.register({ name: "Weather", baseUrl: "https://a.com", mcpPath: "/mcp", description: "Weather", categories: ["weather"] });
    store.register({ name: "Finance", baseUrl: "https://b.com", mcpPath: "/mcp", description: "Finance", categories: ["finance"] });
    const results = store.search({ categories: ["weather"] });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Weather");
  });

  it("searches by text query", () => {
    store.register({ name: "Premium Weather", baseUrl: "https://a.com", mcpPath: "/mcp", description: "High quality weather forecasts", categories: ["weather"] });
    const results = store.search({ query: "forecast" });
    expect(results).toHaveLength(1);
  });

  it("returns undefined for unknown id", () => {
    expect(store.getById("nonexistent")).toBeUndefined();
  });

  it("lists all services", () => {
    store.register({ name: "A", baseUrl: "https://a.com", mcpPath: "/mcp", description: "A", categories: ["a"] });
    store.register({ name: "B", baseUrl: "https://b.com", mcpPath: "/mcp", description: "B", categories: ["b"] });
    expect(store.listAll()).toHaveLength(2);
  });
});
