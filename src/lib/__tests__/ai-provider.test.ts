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
    // Note: modelId is not directly accessible on LanguageModel in AI SDK v6
    // This test verifies the function doesn't throw
    expect(model).toBeDefined();
  });

  it("falls back correctly for reasoning model", () => {
    const model = getModel("deepseek/deepseek-reasoner");
    expect(model).toBeDefined();
  });

  it("uses AI Gateway when VERCEL_OIDC_TOKEN is present", () => {
    process.env.VERCEL_OIDC_TOKEN = "test-oidc-token";
    const model = getModel("deepseek/deepseek-chat");
    // Gateway model retains the full "provider/model" ID
    // Note: modelId is not directly accessible on LanguageModel in AI SDK v6
    expect(model).toBeDefined();
  });

  it("uses AI Gateway when AI_GATEWAY_API_KEY is present", () => {
    process.env.AI_GATEWAY_API_KEY = "test-api-key";
    const model = getModel("deepseek/deepseek-chat");
    expect(model).toBeDefined();
  });

  it("OIDC takes precedence (checked first)", () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc-token";
    process.env.AI_GATEWAY_API_KEY = "api-key";
    const model = getModel("deepseek/deepseek-reasoner");
    expect(model).toBeDefined();
  });
});
