import { env } from "@/lib/env";

/** Send a text message to the configured Telegram chat. No-ops if env vars are missing. */
export async function sendTelegramAlert(message: string, parseMode?: "Markdown" | "HTML") {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const body: Record<string, unknown> = {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: false,
    };
    if (parseMode) body.parse_mode = parseMode;
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

/** Send a photo with caption to the configured Telegram chat. */
export async function sendTelegramPhoto(photoUrl: string, caption: string, parseMode?: "Markdown" | "HTML") {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const body: Record<string, unknown> = {
      chat_id: env.TELEGRAM_CHAT_ID,
      photo: photoUrl,
      caption,
    };
    if (parseMode) body.parse_mode = parseMode;
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[TELEGRAM] sendPhoto error ${res.status}: ${detail}`);
    }
  } catch (err) {
    console.error("[TELEGRAM] Failed to send photo", err);
  }
}
