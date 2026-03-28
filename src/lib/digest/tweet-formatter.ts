import { env } from "@/lib/env";
import type { DigestData } from "./types";

/** Format a price line for tweet display */
function fmtPrice(p: { symbol: string; price: number; change24h: number }): string {
  const sign = p.change24h >= 0 ? "+" : "";
  const price = p.price >= 1
    ? p.price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : `$${p.price.toPrecision(3)}`;
  return `${p.symbol.padEnd(8)} ${price.padStart(10)}   ${sign}${p.change24h.toFixed(1)}%`;
}

/** Pick the most dramatic data block for pair mode */
function pickStrongestBlock(data: DigestData): string | null {
  // Whale flows with large net movement
  const bigWhale = data.whaleFlows.find((w) => Math.abs(w.netFlowUsd) > 10_000_000);
  if (bigWhale) {
    const dir = bigWhale.netFlowUsd > 0 ? "inflow" : "outflow";
    const amt = `$${Math.abs(bigWhale.netFlowUsd / 1e6).toFixed(0)}M`;
    return `Whale watch\n\n-> ${amt} ${bigWhale.token} net ${dir} (7d)`;
  }

  // Sentiment with extreme readings
  const extreme = data.sentiment.find((s) => s.score !== null && (s.score > 75 || s.score < 30));
  if (extreme) {
    const bar = (score: number) => {
      const filled = Math.round(score / 10);
      return "|".repeat(filled) + ".".repeat(10 - filled);
    };
    return `Sentiment\n\n${extreme.token}  ${bar(extreme.score!)}  ${extreme.score} -- ${extreme.label}`;
  }

  // Default: price table
  return null;
}

/** Build a price table block from digest data */
function priceBlock(data: DigestData): string {
  const sorted = [...data.prices].sort((a, b) => b.change24h - a.change24h);
  const lines = sorted.slice(0, 6).map(fmtPrice);
  return `Top movers today\n\n${lines.join("\n")}`;
}

/**
 * Format digest data into tweet(s) based on TWITTER_THREAD_MODE.
 * Returns an array of tweet strings (length 1 for single, 2 for pair, 4-5 for thread).
 */
export function formatDigestTweets(data: DigestData, date: string, digestContent: string): string[] {
  const mode = env.TWITTER_THREAD_MODE;
  const digestUrl = `${env.URL}/digest/${date}`;

  // Extract verdict from digest content
  const verdictMatch = digestContent.match(/\[VERDICT:([^|]+)\|(\w+)]/);
  const verdict = verdictMatch ? verdictMatch[1].trim() : "";

  // Find biggest movers for hook
  const sorted = [...data.prices].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
  const top3 = sorted.slice(0, 3);

  const hookLines = top3.map((p) => {
    const sign = p.change24h >= 0 ? "+" : "";
    return `${p.symbol} ${sign}${p.change24h.toFixed(1)}%`;
  });

  if (mode === "single") {
    const parts = [
      `${date} -- On-Chain Brief`,
      "",
      ...hookLines,
      "",
      verdict || undefined,
      "",
      digestUrl,
    ].filter((line) => line !== undefined) as string[];

    return [parts.join("\n")];
  }

  if (mode === "pair") {
    const hook = [
      `${date} -- On-Chain Brief`,
      "",
      ...hookLines,
      "",
      verdict || undefined,
      "",
      digestUrl,
    ].filter((line) => line !== undefined) as string[];

    const secondBlock = pickStrongestBlock(data) ?? priceBlock(data);
    const second = [secondBlock, "", `Ask Obol anything`, `${env.URL}/chat`].join("\n");

    return [hook.join("\n"), second];
  }

  // thread mode
  const tweet1 = [
    `${date} -- Daily On-Chain Brief`,
    "",
    ...hookLines.map((l) => `${l}`),
    "",
    "Full thread ->",
  ].join("\n");

  const tweet2 = priceBlock(data);

  // Whale tweet
  const whaleLines = data.whaleFlows.slice(0, 3).map((w) => {
    const dir = w.netFlowUsd > 0 ? "inflow" : "outflow";
    const amt = `$${Math.abs(w.netFlowUsd / 1e6).toFixed(0)}M`;
    return `-> ${amt} ${w.token} net ${dir}`;
  });
  const tweet3 = whaleLines.length > 0
    ? `Whale watch\n\n${whaleLines.join("\n")}`
    : null;

  // Sentiment tweet
  const sentimentLines = data.sentiment
    .filter((s) => s.score !== null)
    .slice(0, 3)
    .map((s) => {
      const filled = Math.round((s.score ?? 0) / 10);
      const bar = "|".repeat(filled) + ".".repeat(10 - filled);
      return `${s.token.padEnd(5)} ${bar}  ${s.score} -- ${s.label}`;
    });
  const tweet4 = sentimentLines.length > 0
    ? `Sentiment snapshot\n\n${sentimentLines.join("\n")}`
    : null;

  const tweetCta = [
    digestUrl,
    "",
    `Or ask Obol anything on-chain`,
    `${env.URL}/chat`,
  ].join("\n");

  return [tweet1, tweet2, tweet3, tweet4, tweetCta].filter(Boolean) as string[];
}
