import { env } from "@/lib/env";

/** Send a message to the configured Telegram chat. No-ops if env vars are missing. */
export async function sendTelegramAlert(message: string, markdown = false) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const body: Record<string, unknown> = {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: false,
    };
    if (markdown) body.parse_mode = "Markdown";
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[TELEGRAM] API error ${res.status}: ${detail}`);
    }
  } catch (err) {
    console.error("[TELEGRAM] Failed to send alert", err);
  }
}
