import { env } from "@/lib/env";

const BASE_URL = env.URL || "https://obolai.xyz";

/** Standard branded footer appended to every response */
function footer(symbol?: string): string {
  const lines = [];
  if (symbol) {
    lines.push(`Deep analysis -> ${BASE_URL}/token/${symbol}`);
  }
  lines.push(`Ask more -> ${BASE_URL}/chat`);
  lines.push(`---`);
  lines.push(`Powered by Obol AI | x402 intelligence`);
  return lines.join("\n");
}

export function formatPrice(data: {
  symbol: string; name: string; price: number; change24h: number; marketCap: number;
}): string {
  const sign = data.change24h >= 0 ? "+" : "";
  const price = data.price >= 1
    ? data.price.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : `$${data.price.toPrecision(3)}`;
  const mcap = data.marketCap > 0 ? `$${(data.marketCap / 1e9).toFixed(1)}B` : "N/A";

  return [
    `${data.name} (${data.symbol})`,
    "",
    `Price: ${price}`,
    `24h: ${sign}${data.change24h.toFixed(1)}%`,
    `MCap: ${mcap}`,
    "",
    footer(data.symbol),
  ].join("\n");
}

export function formatSecurity(symbol: string, sec: { score: number; details?: string }): string {
  const verdict = sec.score >= 70 ? "Looks safe" : sec.score >= 40 ? "Moderate risk" : "High risk";
  return [
    `${symbol} Token Security Check`,
    "",
    `Security Score: ${sec.score}/100`,
    `Verdict: ${verdict}`,
    sec.details ? `\n>> ${sec.details}` : "",
    "",
    footer(symbol),
  ].filter(Boolean).join("\n");
}

export function formatWhales(symbol: string, flow: { netFlowUsd: number; largeTxCount: number }): string {
  const dir = flow.netFlowUsd >= 0 ? "inflow" : "outflow";
  const amt = `$${(Math.abs(flow.netFlowUsd) / 1e6).toFixed(1)}M`;

  return [
    `${symbol} Whale Activity (7d)`,
    "",
    `Net flow: ${amt} ${dir}`,
    `Large transactions: ${flow.largeTxCount}`,
    "",
    footer(symbol),
  ].join("\n");
}

export function formatAlpha(text: string): string {
  return [
    `Today's Alpha`,
    "",
    text,
    "",
    `Full briefing -> ${BASE_URL}/digest`,
    `---`,
    `Powered by Obol AI | x402 intelligence`,
  ].join("\n");
}

export function formatRateLimited(): string {
  return [
    `Daily limit reached for this group.`,
    "",
    `For unlimited answers -> ${BASE_URL}/chat`,
  ].join("\n");
}

export function formatError(): string {
  return `Sorry, I couldn't process that request. Try again or visit ${BASE_URL}/chat`;
}
