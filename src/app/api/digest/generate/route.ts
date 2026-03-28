import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ReportStore } from "@/lib/reports/report-store";
import { collectDigestData } from "@/lib/digest/collector";
import { generateDigest } from "@/lib/digest/generator";
import { sendTelegramAlert } from "@/lib/telegram";
import { formatDigestTweets } from "@/lib/digest/tweet-formatter";
import { postThread } from "@/lib/twitter";
import { generateTokenSnapshots } from "@/lib/token-pages/generator";

export const maxDuration = 120;

export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Idempotency: skip if today's digest already exists
  try {
    const existing = await ReportStore.getDigestByDate(today);
    if (existing) {
      return NextResponse.json({ status: "already_exists", id: existing.id, date: today });
    }
  } catch (err) {
    console.warn("[DIGEST] Failed to check existing digest, proceeding", err);
  }

  try {
    // Collect → Reduce → Generate → Save
    const data = await collectDigestData();
    const { title, content, markers } = await generateDigest(data);

    // Build symbol → icon URL map for the viewer
    const tokenIcons: Record<string, string> = {};
    for (const p of data.prices) {
      if (p.iconUrl) tokenIcons[p.symbol] = p.iconUrl;
    }

    const report = await ReportStore.create({
      title,
      content,
      markers,
      metadata: {
        type: "daily_digest",
        date: today,
        tokenCount: data.prices.length,
        sourcesOk: ["prices", "whale_flows", "cex_flows", "stablecoin_supply", "sentiment"].length - data.errors.length,
        sourcesFailed: data.errors,
        tokenIcons,
      },
      type: "digest",
      digestDate: today,
    });

    // Shared data for social posts
    const digestUrl = `${env.URL}/digest/${today}`;
    const verdictMatch = content.match(/\[VERDICT:([^|]+)\|(\w+)]/);
    const verdictText = verdictMatch ? verdictMatch[1].trim() : "";

    const fmt = (p: typeof data.prices[0]) => {
      const sign = p.change24h >= 0 ? "+" : "";
      const price = p.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
      return { symbol: p.symbol, price, change: `${sign}${p.change24h.toFixed(1)}%`, up: p.change24h >= 0 };
    };
    const top6 = data.prices.slice(0, 6).map(fmt);

    // Only use widely recognized coin symbols
    const coinGlyph: Record<string, string> = {
      BTC: "\u20BF", // ₿
      ETH: "\u039E", // Ξ
    };
    const glyph = (sym: string) => coinGlyph[sym] ?? "";

    const displayDate = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", {
      weekday: "long", month: "short", day: "numeric", year: "numeric",
    });

    // HTML-escape dynamic text to prevent broken Telegram messages
    const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // ── Telegram (HTML) ──
    const tgPrices = top6.map(p => {
      const g = glyph(p.symbol);
      const label = g ? `${g} <b>${p.symbol}</b>` : `<b>${p.symbol}</b>`;
      const arrow = p.up ? "\u25B2" : "\u25BC";
      return `  ${label}  ${p.price}  ${arrow} ${p.change}`;
    }).join("\n");

    const telegramMsg = [
      `<b>Obol AI \u2014 Daily Briefing</b>`,
      `<i>${displayDate}</i>`,
      "",
      tgPrices,
      "",
      verdictText ? `\u25B8 ${escHtml(verdictText)}` : null,
      "",
      `<a href="${digestUrl}">Read the full briefing \u2192</a>`,
      data.errors.length > 0 ? `\n<i>Partial data: ${escHtml(data.errors.join(", "))}</i>` : null,
    ].filter((line) => line !== null).join("\n");

    await sendTelegramAlert(telegramMsg, "HTML").catch((err) => {
      console.error("[DIGEST] Telegram share failed:", err);
    });

    // ── X / Twitter ──
    const tweets = formatDigestTweets(data, today, content);
    await postThread(tweets).catch((err) => {
      console.error("[DIGEST] Twitter share failed:", err);
    });

    // ── Token SEO pages ──
    await generateTokenSnapshots(data, today).catch((err) => {
      console.error("[DIGEST] Token snapshot generation failed:", err);
    });

    return NextResponse.json({ status: "created", id: report.id, date: today });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DIGEST] Generation failed", msg);
    await sendTelegramAlert(`<b>Digest Generation Failed</b>\n\n${today}\n${msg}`, "HTML").catch(() => {});
    return NextResponse.json({ error: "Generation failed", detail: msg }, { status: 500 });
  }
}
