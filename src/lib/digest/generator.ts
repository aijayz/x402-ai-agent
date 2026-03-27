import { generateText } from "ai";
import { getModel, probeModel } from "@/lib/ai-provider";
import { env } from "@/lib/env";
import { extractMarkers, extractTitle } from "@/lib/reports/parse-markers";
import type { DigestData } from "./types";

const DIGEST_SYSTEM_PROMPT = `You are Obol's market analyst. Generate a concise daily crypto briefing from the pre-processed data below.

Structure your briefing with these sections (skip any section where the data is empty or missing):

1. **Market Overview** — prices + 24h changes. Use [METRIC:symbol|$price|+X.X%] for each of the 10 tokens. Put the 6 fixed majors first, then the 4 top movers with a "Today's Top Movers" sub-header.

2. **Whale & Exchange Signals** — net flows, CEX flows. Negative CEX flow = exchange outflow = bullish accumulation signal. Positive = selling pressure. Use actual USD figures.

3. **Liquidity & Macro** — stablecoin supply changes on Ethereum and Base. Growing supply = buying power entering the ecosystem. Use [METRIC:chain Stablecoin Supply|$value|+X.X%].

4. **Sentiment Pulse** — social mood for tracked tokens. Use [SCORE:Token Sentiment|N/100] for scored tokens. Note the label (bullish/bearish/neutral).

5. **Daily Verdict** — one-sentence synthesis of the overall market picture. Use [VERDICT:your verdict text|green] for bullish, [VERDICT:...|amber] for mixed, [VERDICT:...|red] for bearish.

Rules:
- Use [METRIC:label|value|change], [SCORE:label|n/max], [VERDICT:text|color] markers throughout
- CRITICAL: Place each marker on its own line. NEVER put markers inline within a sentence. Group related markers together on consecutive lines. Write prose BEFORE or AFTER marker groups, not between individual markers. Bad: "BTC [METRIC:BTC|$68k|-1%], ETH [METRIC:ETH|$2k|-2%] fell today." Good: "Major assets declined across the board.\n\n[METRIC:BTC|$68k|-1.7%]\n[METRIC:ETH|$2,067|-2.4%]\n[METRIC:SOL|$86|-3.5%]\n\nThe broad pullback signals..."
- Be concise. No filler. Every sentence should convey a signal.
- Do NOT mention data sources by name (no "Dune says", "GenVox reports", "CoinGecko shows")
- Do NOT mention any data that is missing or unavailable — just skip that section silently
- Interpret the numbers — don't just restate them. "ETH whale outflow of -$2.3M alongside +40% DEX volume suggests profit-taking, not capitulation" is the kind of analysis we want.
- Format large numbers readably: $2.3M not $2300000, $1.2B not $1200000000
- Total output should be 400-800 words`;

interface GenerateResult {
  title: string;
  content: string;
  markers: unknown[];
}

/**
 * Generate a daily digest from pre-reduced data.
 * Uses the model fallback chain (same as chat) to handle provider outages.
 */
export async function generateDigest(data: DigestData): Promise<GenerateResult> {
  const payload = JSON.stringify(data);

  // Try models in fallback order
  const models = [...new Set([
    env.AI_MODEL,
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
  ])];

  let lastError: unknown;

  for (const modelId of models) {
    try {
      await probeModel(modelId);

      const { text } = await generateText({
        model: getModel(modelId),
        system: DIGEST_SYSTEM_PROMPT,
        prompt: payload,
        maxOutputTokens: 2000,
      });

      const content = text.trim();
      const markers = extractMarkers(content);

      // Extract title from VERDICT, or use date fallback
      let title = extractTitle(content);
      if (title.startsWith("Obol Analysis")) {
        const dateStr = new Date(data.date).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        title = `Daily Briefing — ${dateStr}`;
      }

      return { title, content, markers };
    } catch (err) {
      console.warn(`[DIGEST] Model ${modelId} failed:`, err instanceof Error ? err.message : err);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All models failed");
}
