import { gateway } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

/**
 * Returns a LanguageModel for the given gateway model string (e.g. "deepseek/deepseek-chat").
 *
 * On Vercel: uses AI Gateway (OIDC or API key auth — run `vercel env pull` to provision).
 * Local dev: falls back to the direct DeepSeek provider using DEEPSEEK_API_KEY.
 */
export function getModel(modelId: string): LanguageModel {
  if (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY) {
    return gateway(modelId as Parameters<typeof gateway>[0]);
  }
  // Local dev fallback — strip the "provider/" prefix for direct SDK usage
  const deepseekModelName = modelId.replace(/^[^/]+\//, "");
  return deepseek(deepseekModelName) as LanguageModel;
}
