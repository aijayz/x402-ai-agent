import { deepseek } from "@ai-sdk/deepseek";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Returns a LanguageModel for the given model string (e.g. "google/gemini-2.0-flash").
 *
 * Routes to the appropriate provider SDK based on the "provider/" prefix.
 */
export function getModel(modelId: string): LanguageModel {
  const [provider, ...rest] = modelId.split("/");
  const modelName = rest.join("/");

  if (provider === "google") {
    return google(modelName) as LanguageModel;
  }
  // Default to DeepSeek for deepseek/* or unknown providers
  return deepseek(modelName || modelId) as LanguageModel;
}
