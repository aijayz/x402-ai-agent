// src/lib/__tests__/x402-client.test.ts
import { describe, it, expect } from "vitest";
import { parse402Response } from "../x402-client";

describe("x402-client", () => {
  it("parses 402 response with payment requirements", () => {
    const body = {
      x402Version: 1,
      error: "Payment Required",
      accepts: [{
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "10000",
        resource: "/api/scan",
        payTo: "0xABC",
        maxTimeoutSeconds: 60,
        asset: "USDC",
        description: "Rug scan",
        mimeType: "application/json",
      }],
    };
    const result = parse402Response(body);
    expect(result).not.toBeNull();
    expect(result!.requirements.maxAmountRequired).toBe("10000");
    expect(result!.version).toBe(1);
  });

  it("returns null for non-402 body", () => {
    const result = parse402Response({ data: "ok" });
    expect(result).toBeNull();
  });

  it("parses x402 v2 Payment-Required header (base64-encoded)", () => {
    const headerPayload = {
      x402Version: 2,
      error: "Payment required",
      resource: { url: "https://example.com/api", description: "Test", mimeType: "application/json" },
      accepts: [{
        scheme: "exact",
        network: "eip155:8453",
        amount: "100000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      }],
    };
    const encoded = Buffer.from(JSON.stringify(headerPayload)).toString("base64");
    // Body is empty {} but header has payment info
    const result = parse402Response({}, encoded);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.requirements.maxAmountRequired).toBe("100000");
    expect(result!.requirements.network).toBe("base");
    expect(result!.requirements.payTo).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });

  it("prefers body over header when both present", () => {
    const body = {
      x402Version: 1,
      accepts: [{
        scheme: "exact",
        network: "base",
        maxAmountRequired: "5000",
        resource: "/api",
        payTo: "0xBODY",
        maxTimeoutSeconds: 60,
        asset: "USDC",
        description: "body",
        mimeType: "application/json",
      }],
    };
    const headerPayload = {
      x402Version: 2,
      accepts: [{ scheme: "exact", network: "base", amount: "99999", payTo: "0xHEADER", asset: "USDC" }],
    };
    const encoded = Buffer.from(JSON.stringify(headerPayload)).toString("base64");
    const result = parse402Response(body, encoded);
    expect(result!.requirements.payTo).toBe("0xBODY");
    expect(result!.requirements.maxAmountRequired).toBe("5000");
  });
});
