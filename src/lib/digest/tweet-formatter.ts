import { env } from "@/lib/env";
import type { DigestData } from "./types";

// ── Helpers ──────────────────────────────────────────────────

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

function shortDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtPrice(p: { symbol: string; price: number; change24h: number }): string {
  const sign = p.change24h >= 0 ? "+" : "";
  const price =
    p.price >= 1
      ? p.price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      : `$${p.price.toPrecision(3)}`;
  return `${p.symbol.padEnd(8)} ${price.padStart(10)}   ${sign}${p.change24h.toFixed(1)}%`;
}

/** Build a price table block from digest data */
function priceBlock(data: DigestData): string {
  const sorted = [...data.prices].sort((a, b) => b.change24h - a.change24h);
  const lines = sorted.slice(0, 6).map(fmtPrice);
  return `Top movers today\n\n${lines.join("\n")}`;
}

function longDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

const coinGlyph: Record<string, string> = { BTC: "\u20BF", ETH: "\u039E" };

function buildPriceSectionPlain(data: DigestData): string {
  const top6 = data.prices.slice(0, 6);
  return top6
    .map((p) => {
      const g = coinGlyph[p.symbol] ?? "";
      const label = g ? `${g} ${p.symbol}` : p.symbol;
      const price = p.price >= 1
        ? p.price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
        : `$${p.price.toPrecision(3)}`;
      const sign = p.change24h >= 0 ? "+" : "";
      const arrow = p.change24h >= 0 ? "\u25B2" : "\u25BC";
      return `  ${label}  ${price}  ${arrow} ${sign}${p.change24h.toFixed(1)}%`;
    })
    .join("\n");
}

function buildWhaleSectionPlain(flows: DigestData["whaleFlows"]): string | null {
  const entries: string[] = [];
  for (const w of flows) {
    if (entries.length >= 3) break;
    if (w.hasExchangeSplit && (w.inflowUsd > 0 || w.outflowUsd > 0)) {
      const dir = w.netFlowUsd > 0 ? "inflow to exchanges" : "outflow from exchanges";
      entries.push(`> ${fmtUsd(Math.abs(w.netFlowUsd))} ${w.token} net ${dir}`);
    } else if (w.totalVolumeUsd > 0) {
      entries.push(`> ${fmtUsd(w.totalVolumeUsd)} ${w.token} whale volume (7d)`);
    }
  }
  if (entries.length === 0) return null;
  return `Whale Signals\n${entries.join("\n")}`;
}

function buildSentimentSectionPlain(sentiment: DigestData["sentiment"]): string | null {
  const entries = sentiment.filter((s) => s.score !== null && s.label !== null).slice(0, 3);
  if (entries.length === 0) return null;
  return `Sentiment\n${entries.map((s) => `> ${s.token}: ${s.label} (${s.score}/100)`).join("\n")}`;
}

function buildStablecoinSectionPlain(supply: DigestData["stablecoinSupply"]): string | null {
  const sig = supply.filter((s) => Math.abs(s.change30dUsd) > 50_000_000);
  if (sig.length === 0) return null;
  const lines = sig.slice(0, 2).map((s) => {
    const dir = s.change30dUsd > 0 ? "up" : "down";
    return `> ${s.chain} stablecoin supply ${dir} ${fmtUsd(Math.abs(s.change30dUsd))} (30d)`;
  });
  return `Stablecoin Flow\n${lines.join("\n")}`;
}

// ── Narrative data nuggets ───────────────────────────────────

interface DataNugget {
  headline: string;
  detail?: string;
}

function selectBestDataNugget(data: DigestData): DataNugget {
  // Priority 1: Large whale exchange flow
  const bigExchangeFlow = data.whaleFlows.find(
    (w) => w.hasExchangeSplit && Math.abs(w.netFlowUsd) > 15_000_000,
  );
  if (bigExchangeFlow) {
    const amt = fmtUsd(Math.abs(bigExchangeFlow.netFlowUsd));
    const direction = bigExchangeFlow.netFlowUsd > 0 ? "to exchanges" : "off exchanges";
    const pressure = bigExchangeFlow.netFlowUsd > 0 ? "selling pressure building" : "accumulation signal";
    return {
      headline: `Whales moved ${amt} ${bigExchangeFlow.token} ${direction} -- ${pressure}.`,
      detail: findSecondaryNugget(data, "whale"),
    };
  }

  // Priority 2: Large whale volume
  const bigVolume = data.whaleFlows.find((w) => w.totalVolumeUsd > 50_000_000);
  if (bigVolume) {
    const amt = fmtUsd(bigVolume.totalVolumeUsd);
    return {
      headline: `${amt} in ${bigVolume.token} whale transactions this week.`,
      detail: findSecondaryNugget(data, "whale"),
    };
  }

  // Priority 3: Large stablecoin supply shift
  const bigStable = data.stablecoinSupply.find((s) => Math.abs(s.change30dUsd) > 200_000_000);
  if (bigStable) {
    const dir = bigStable.change30dUsd > 0 ? "up" : "down";
    const amt = fmtUsd(Math.abs(bigStable.change30dUsd));
    const color = bigStable.change30dUsd > 0 ? "dry powder building" : "capital leaving";
    return {
      headline: `Stablecoin supply ${dir} ${amt} in 30d -- ${color}.`,
      detail: findSecondaryNugget(data, "stablecoin"),
    };
  }

  // Priority 4: Extreme sentiment
  const extreme = data.sentiment.find((s) => s.score !== null && (s.score < 25 || s.score > 80));
  if (extreme) {
    const mood = extreme.score! < 25 ? "fear" : "greed";
    const note = extreme.score! < 25 ? "historically precedes reversals" : "watch for overheating";
    return {
      headline: `${extreme.token} ${mood} reading: ${extreme.score}/100 -- ${note}.`,
      detail: findSecondaryNugget(data, "sentiment"),
    };
  }

  // Priority 5: Top price mover (always available)
  const sorted = [...data.prices].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
  const top = sorted[0];
  const sign = top.change24h >= 0 ? "up" : "down";
  return {
    headline: `${top.symbol} ${sign} ${Math.abs(top.change24h).toFixed(1)}% -- leading today's movers.`,
    detail: findSecondaryNugget(data, "price"),
  };
}

/** Find a secondary signal from a different category than the primary */
function findSecondaryNugget(data: DigestData, excludeCategory: string): string | undefined {
  if (excludeCategory !== "stablecoin") {
    const sig = data.stablecoinSupply.find((s) => Math.abs(s.change30dUsd) > 100_000_000);
    if (sig) {
      const dir = sig.change30dUsd > 0 ? "up" : "down";
      return `Stablecoin supply ${dir} ${fmtUsd(Math.abs(sig.change30dUsd))} -- ${sig.change30dUsd > 0 ? "dry powder accumulating" : "capital leaving"}.`;
    }
  }

  if (excludeCategory !== "sentiment") {
    const ext = data.sentiment.find((s) => s.score !== null && (s.score < 30 || s.score > 75));
    if (ext) {
      return `${ext.token} sentiment: ${ext.score}/100 (${ext.label}).`;
    }
  }

  if (excludeCategory !== "price") {
    const sorted = [...data.prices].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
    const top = sorted[0];
    if (Math.abs(top.change24h) > 3) {
      const sign = top.change24h >= 0 ? "+" : "";
      return `${top.symbol} ${sign}${top.change24h.toFixed(1)}% today.`;
    }
  }

  return undefined;
}

/** Truncate tweet to fit within 280 chars, accounting for t.co 23-char URL wrapping */
function truncateToFit(lines: string[], maxChars = 280): string {
  // URLs are wrapped to 23 chars by t.co
  const urlPattern = /https?:\/\/\S+/g;
  const countChars = (text: string) => {
    const urls = text.match(urlPattern) ?? [];
    let len = text.length;
    for (const url of urls) {
      len = len - url.length + 23;
    }
    return len;
  };

  let text = lines.join("\n");
  if (countChars(text) <= maxChars) return text;

  // Drop detail line (last content line before URL) if present
  if (lines.length > 2) {
    const trimmed = [...lines];
    // Find last non-URL, non-empty line before the URL
    for (let i = trimmed.length - 2; i >= 1; i--) {
      if (trimmed[i] && !trimmed[i].match(urlPattern)) {
        trimmed.splice(i, 1);
        text = trimmed.join("\n");
        if (countChars(text) <= maxChars) return text;
        break;
      }
    }
  }

  // Last resort: truncate headline
  return text.slice(0, maxChars - 3) + "...";
}

// ── Public API ───────────────────────────────────────────────

/**
 * Format digest data into tweet(s) based on TWITTER_THREAD_MODE.
 * Returns an array of tweet strings (length 1 for single, 2 for pair, 4-5 for thread).
 */
export function formatDigestTweets(data: DigestData, date: string, digestContent: string): string[] {
  const mode = env.TWITTER_THREAD_MODE;
  const digestUrl = `${env.URL}/digest/${date}`;
  const chatUrl = `${env.URL}/chat`;
  const short = shortDate(date);
  const nugget = selectBestDataNugget(data);

  if (mode === "single") {
    // Rich long-form post (premium X — no 280-char limit)
    const verdictMatch = digestContent.match(/\[VERDICT:([^|]+)\|(\w+)]/);
    const verdictText = verdictMatch ? verdictMatch[1].trim() : "";

    const sections: (string | null)[] = [
      `Obol AI -- Daily Briefing`,
      longDate(date),
      "",
      buildPriceSectionPlain(data),
      "",
      buildWhaleSectionPlain(data.whaleFlows),
      buildSentimentSectionPlain(data.sentiment),
      buildStablecoinSectionPlain(data.stablecoinSupply),
      verdictText ? `> ${verdictText}` : null,
      "",
      digestUrl,
    ];

    return [sections.filter((s) => s !== null).join("\n")];
  }

  if (mode === "pair") {
    // Hook tweet: narrative lead + digest URL
    const hook = truncateToFit([
      `${short} -- ${nugget.headline}`,
      ...(nugget.detail ? ["", nugget.detail] : []),
      "",
      digestUrl,
    ]);

    // Data tweet: price block + chat URL
    const second = [priceBlock(data), "", chatUrl].join("\n");

    return [hook, second];
  }

  // ── Thread mode ──

  const tweet1Lines = [`${short} -- ${nugget.headline}`];
  if (nugget.detail) tweet1Lines.push("", nugget.detail);
  tweet1Lines.push("", "Full thread ->");
  const tweet1 = truncateToFit(tweet1Lines);

  const tweet2 = priceBlock(data);

  // Whale tweet
  const whaleLines = data.whaleFlows
    .slice(0, 3)
    .map((w) => {
      if (w.hasExchangeSplit && (w.inflowUsd > 0 || w.outflowUsd > 0)) {
        const dir = w.netFlowUsd > 0 ? "inflow" : "outflow";
        const amt = fmtUsd(Math.abs(w.netFlowUsd));
        return `-> ${amt} ${w.token} net ${dir}`;
      }
      if (w.totalVolumeUsd > 0) {
        return `-> ${fmtUsd(w.totalVolumeUsd)} ${w.token} whale volume`;
      }
      return null;
    })
    .filter(Boolean) as string[];
  const tweet3 = whaleLines.length > 0 ? `Whale watch\n\n${whaleLines.join("\n")}` : null;

  // Sentiment tweet
  const sentimentLines = data.sentiment
    .filter((s) => s.score !== null)
    .slice(0, 3)
    .map((s) => {
      const filled = Math.round((s.score ?? 0) / 10);
      const bar = "|".repeat(filled) + ".".repeat(10 - filled);
      return `${s.token.padEnd(5)} ${bar}  ${s.score} -- ${s.label}`;
    });
  const tweet4 = sentimentLines.length > 0 ? `Sentiment snapshot\n\n${sentimentLines.join("\n")}` : null;

  const tweetCta = [digestUrl, "", chatUrl].join("\n");

  return [tweet1, tweet2, tweet3, tweet4, tweetCta].filter(Boolean) as string[];
}
