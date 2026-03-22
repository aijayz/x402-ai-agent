import { deepseek } from "@ai-sdk/deepseek";
import { google } from "@ai-sdk/google";
import { generateText, type LanguageModel } from "ai";

/**
 * Returns a LanguageModel for the given model string (e.g. "google/gemini-2.5-flash").
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

/**
 * Cached probe results to avoid re-probing healthy models on every request.
 * Cache entry expires after 5 minutes, or immediately on failure.
 */
const probeCache = new Map<string, { ok: boolean; ts: number }>();
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Probes a model with a minimal request to verify it's reachable.
 * Results are cached for 5 minutes to avoid per-request latency.
 */
export async function probeModel(modelId: string): Promise<void> {
  const cached = probeCache.get(modelId);
  if (cached && cached.ok && Date.now() - cached.ts < PROBE_CACHE_TTL_MS) {
    return; // recently confirmed healthy
  }

  try {
    const model = getModel(modelId);
    await generateText({
      model,
      prompt: "hi",
      maxOutputTokens: 1,
    });
    probeCache.set(modelId, { ok: true, ts: Date.now() });
  } catch (err) {
    probeCache.set(modelId, { ok: false, ts: Date.now() });
    throw err;
  }
}

/**
 * Invalidate a model's probe cache (call when streaming fails mid-request).
 */
export function invalidateProbe(modelId: string): void {
  probeCache.delete(modelId);
}
