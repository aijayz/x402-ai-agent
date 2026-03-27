import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ReportStore } from "@/lib/reports/report-store";
import { collectDigestData } from "@/lib/digest/collector";
import { generateDigest } from "@/lib/digest/generator";
import { sendTelegramAlert } from "@/lib/telegram";

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

    // Share digest to Telegram
    const digestUrl = `https://www.obolai.xyz/digest/${today}`;
    const priceLines = data.prices.slice(0, 6).map(p => {
      const sign = p.change24h >= 0 ? "+" : "";
      return `${p.symbol} $${p.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${sign}${p.change24h.toFixed(1)}%)`;
    }).join("\n");

    // Extract verdict text from content
    const verdictMatch = content.match(/\[VERDICT:([^|]+)\|(\w+)]/);
    const verdictLine = verdictMatch ? `\n\n*${verdictMatch[1].trim()}*` : "";

    const telegramMsg = [
      `*Daily Briefing — ${today}*`,
      "",
      priceLines,
      verdictLine,
      "",
      `[Read full briefing](${digestUrl})`,
      data.errors.length > 0 ? `\n_Partial: ${data.errors.join(", ")}_` : "",
    ].filter(Boolean).join("\n");

    await sendTelegramAlert(telegramMsg).catch(() => {});

    return NextResponse.json({ status: "created", id: report.id, date: today });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DIGEST] Generation failed", msg);
    await sendTelegramAlert(`*Digest Generation Failed*\n\n${today}\n${msg}`).catch(() => {});
    return NextResponse.json({ error: "Generation failed", detail: msg }, { status: 500 });
  }
}
