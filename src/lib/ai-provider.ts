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
 * Cached probe results — both successes AND failures are cached.
 * Healthy probes: cached for 5 minutes.
 * Failed probes: cached for 2 minutes (avoids re-probing dead models on every request).
 */
const probeCache = new Map<string, { ok: boolean; ts: number; error?: unknown }>();
const PROBE_OK_TTL_MS = 5 * 60 * 1000;
const PROBE_FAIL_TTL_MS = 2 * 60 * 1000;

/**
 * Probes a model with a minimal request to verify it's reachable.
 * Both success and failure are cached to avoid wasting time on known-dead models.
 */
export async function probeModel(modelId: string): Promise<void> {
  const cached = probeCache.get(modelId);
  if (cached) {
    const ttl = cached.ok ? PROBE_OK_TTL_MS : PROBE_FAIL_TTL_MS;
    if (Date.now() - cached.ts < ttl) {
      if (cached.ok) return;
      throw cached.error ?? new Error(`Model ${modelId} recently failed probe`);
    }
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
    probeCache.set(modelId, { ok: false, ts: Date.now(), error: err });
    throw err;
  }
}

/**
 * Invalidate a model's probe cache (call when streaming fails mid-request).
 */
export function invalidateProbe(modelId: string): void {
  probeCache.delete(modelId);
}
