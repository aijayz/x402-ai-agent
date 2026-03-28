import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ReportStore } from "@/lib/reports/report-store";
import { collectDigestData } from "@/lib/digest/collector";
import { generateDigest } from "@/lib/digest/generator";
import { sendTelegramAlert } from "@/lib/telegram";
import { formatDigestTweets } from "@/lib/digest/tweet-formatter";
import { formatTelegramDigest } from "@/lib/digest/telegram-formatter";
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
        sourcesOk: ["prices", "whale_flows", "stablecoin_supply", "sentiment"].length - data.errors.length,
        sourcesFailed: data.errors,
        tokenIcons,
      },
      type: "digest",
      digestDate: today,
    });

    // ── Telegram (HTML) ──
    const telegramMsg = formatTelegramDigest(data, today, content, env.URL);
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
