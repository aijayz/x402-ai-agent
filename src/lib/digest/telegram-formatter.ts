import type { DigestData } from "./types";

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const coinGlyph: Record<string, string> = {
  BTC: "\u20BF", // ₿
  ETH: "\u039E", // Ξ
};

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

function buildPriceSection(data: DigestData): string {
  const top6 = data.prices.slice(0, 6);
  return top6
    .map((p) => {
      const g = coinGlyph[p.symbol];
      const label = g ? `${g} <b>${p.symbol}</b>` : `<b>${p.symbol}</b>`;
      const price = p.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
      const sign = p.change24h >= 0 ? "+" : "";
      const arrow = p.change24h >= 0 ? "\u25B2" : "\u25BC";
      return `  ${label}  ${price}  ${arrow} ${sign}${p.change24h.toFixed(1)}%`;
    })
    .join("\n");
}

function buildWhaleSection(flows: DigestData["whaleFlows"]): string | null {
  const entries: string[] = [];
  for (const w of flows) {
    if (entries.length >= 3) break;
    if (w.hasExchangeSplit && (w.inflowUsd > 0 || w.outflowUsd > 0)) {
      const dir = w.netFlowUsd > 0 ? "inflow to exchanges" : "outflow from exchanges";
      entries.push(`${fmtUsd(Math.abs(w.netFlowUsd))} ${w.token} net ${dir}`);
    } else if (w.totalVolumeUsd > 0) {
      entries.push(`${fmtUsd(w.totalVolumeUsd)} ${w.token} whale volume (7d)`);
    }
  }
  if (entries.length === 0) return null;
  return `<b>Whale Signals</b>\n${entries.map((e) => `\u25B8 ${escHtml(e)}`).join("\n")}`;
}

function buildSentimentSection(sentiment: DigestData["sentiment"]): string | null {
  const entries = sentiment
    .filter((s) => s.score !== null && s.label !== null)
    .slice(0, 3);
  if (entries.length === 0) return null;
  return `<b>Sentiment</b>\n${entries
    .map((s) => `\u25B8 ${escHtml(s.token)}: ${escHtml(s.label!)} (${s.score}/100)`)
    .join("\n")}`;
}

function buildStablecoinSection(supply: DigestData["stablecoinSupply"]): string | null {
  const sig = supply.filter((s) => Math.abs(s.change30dUsd) > 50_000_000);
  if (sig.length === 0) return null;
  const lines = sig.slice(0, 2).map((s) => {
    const dir = s.change30dUsd > 0 ? "up" : "down";
    return `\u25B8 ${escHtml(s.chain)} stablecoin supply ${dir} ${fmtUsd(Math.abs(s.change30dUsd))} (30d)`;
  });
  return `<b>Stablecoin Flow</b>\n${lines.join("\n")}`;
}

export function formatTelegramDigest(
  data: DigestData,
  date: string,
  digestContent: string,
  baseUrl: string,
): string {
  const digestUrl = `${baseUrl}/digest/${date}`;

  const displayDate = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const verdictMatch = digestContent.match(/\[VERDICT:([^|]+)\|(\w+)]/);
  const verdictText = verdictMatch ? verdictMatch[1].trim() : "";

  const sections: (string | null)[] = [
    `<b>Obol AI \u2014 Daily Briefing</b>`,
    `<i>${displayDate}</i>`,
    "",
    buildPriceSection(data),
    "",
    buildWhaleSection(data.whaleFlows),
    buildSentimentSection(data.sentiment),
    buildStablecoinSection(data.stablecoinSupply),
    verdictText ? `\u25B8 ${escHtml(verdictText)}` : null,
    "",
    `<a href="${digestUrl}">Read the full briefing \u2192</a>`,
    data.errors.length > 0
      ? `\n<i>Partial data: ${escHtml(data.errors.join(", "))}</i>`
      : null,
  ];

  return sections.filter((line) => line !== null).join("\n");
}
