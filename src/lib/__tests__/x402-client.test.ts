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
});
