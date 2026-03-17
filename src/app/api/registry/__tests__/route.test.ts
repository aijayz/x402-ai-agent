import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the registry store so each test gets a controlled, isolated state
const mockRegister = vi.fn();
const mockListAll = vi.fn();

vi.mock("@/lib/registry/store", () => ({
  getRegistry: () => ({
    register: mockRegister,
    listAll: mockListAll,
  }),
}));

import { GET, POST } from "../route";

const makePostRequest = (body: unknown) =>
  new Request("http://localhost/api/registry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a valid service and returns 201", async () => {
    const fakeService = {
      id: "uuid-1",
      name: "Weather API",
      baseUrl: "https://weather.example.com",
      mcpPath: "/mcp",
      description: "Real-time weather",
      categories: ["weather"],
      verified: false,
      createdAt: new Date(),
    };
    mockRegister.mockReturnValue(fakeService);

    const res = await POST(
      makePostRequest({
        name: "Weather API",
        baseUrl: "https://weather.example.com",
        description: "Real-time weather",
        categories: ["weather"],
      })
    );

    expect(res.status).toBe(201);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Weather API" })
    );
    const body = await res.json();
    expect(body.id).toBe("uuid-1");
  });

  it("returns 400 for empty name", async () => {
    const res = await POST(makePostRequest({ name: "", baseUrl: "https://example.com", description: "x", categories: ["a"] }));
    expect(res.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid URL", async () => {
    const res = await POST(makePostRequest({ name: "Test", baseUrl: "not-a-url", description: "x", categories: ["a"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty categories", async () => {
    const res = await POST(makePostRequest({ name: "Test", baseUrl: "https://example.com", description: "x", categories: [] }));
    expect(res.status).toBe(400);
  });

  it("applies default mcpPath of /mcp", async () => {
    mockRegister.mockReturnValue({ id: "2" });
    await POST(makePostRequest({ name: "Test", baseUrl: "https://example.com", description: "x", categories: ["a"] }));
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ mcpPath: "/mcp" })
    );
  });
});

describe("GET /api/registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all services with 200", async () => {
    mockListAll.mockReturnValue([
      { id: "1", name: "Service A" },
      { id: "2", name: "Service B" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services).toHaveLength(2);
  });

  it("returns empty array when registry is empty", async () => {
    mockListAll.mockReturnValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.services).toHaveLength(0);
  });
});
