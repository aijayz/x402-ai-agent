import { describe, it, expect, afterEach } from "vitest";
import { getModel } from "../ai-provider";

describe("getModel", () => {
  afterEach(() => {
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("falls back to deepseek provider when no gateway credentials", () => {
    const model = getModel("deepseek/deepseek-chat");
    // Direct DeepSeek provider strips the "provider/" prefix
    expect(model.modelId).toBe("deepseek-chat");
  });

  it("falls back correctly for reasoning model", () => {
    const model = getModel("deepseek/deepseek-reasoner");
    expect(model.modelId).toBe("deepseek-reasoner");
  });

  it("uses AI Gateway when VERCEL_OIDC_TOKEN is present", () => {
    process.env.VERCEL_OIDC_TOKEN = "test-oidc-token";
    const model = getModel("deepseek/deepseek-chat");
    // Gateway model retains the full "provider/model" ID
    expect(model.modelId).toBe("deepseek/deepseek-chat");
  });

  it("uses AI Gateway when AI_GATEWAY_API_KEY is present", () => {
    process.env.AI_GATEWAY_API_KEY = "test-api-key";
    const model = getModel("deepseek/deepseek-chat");
    expect(model.modelId).toBe("deepseek/deepseek-chat");
  });

  it("OIDC takes precedence (checked first)", () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc-token";
    process.env.AI_GATEWAY_API_KEY = "api-key";
    const model = getModel("deepseek/deepseek-reasoner");
    expect(model.modelId).toBe("deepseek/deepseek-reasoner");
  });
});
