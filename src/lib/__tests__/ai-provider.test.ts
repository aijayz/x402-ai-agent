import { describe, it, expect } from "vitest";
import { getModel } from "../ai-provider";

describe("getModel", () => {
  it("returns a google provider model for google/ prefix", () => {
    const model = getModel("google/gemini-2.5-flash");
    expect(model).toBeDefined();
  });

  it("returns a deepseek provider model for deepseek/ prefix", () => {
    const model = getModel("deepseek/deepseek-chat");
    expect(model).toBeDefined();
  });

  it("returns deepseek for reasoning model", () => {
    const model = getModel("deepseek/deepseek-reasoner");
    expect(model).toBeDefined();
  });
});
