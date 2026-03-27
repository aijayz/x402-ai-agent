import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleMessage } from "@/lib/telegram-bot/commands";

export const maxDuration = 30;

/** Verify the webhook secret token (Telegram sends it in X-Telegram-Bot-Api-Secret-Token header) */
function verifyWebhook(req: Request): boolean {
  if (!env.TELEGRAM_BOT_WEBHOOK_SECRET) return true; // no secret configured = allow all (dev mode)
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  return token === env.TELEGRAM_BOT_WEBHOOK_SECRET;
}

/** Send a reply via Telegram Bot API */
async function sendReply(chatId: number, text: string, replyToMessageId: number): Promise<void> {
  if (!env.TELEGRAM_GROUP_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_GROUP_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("[TG-BOT] Failed to send reply:", err);
  }
}

export async function POST(req: Request) {
  if (!verifyWebhook(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.TELEGRAM_GROUP_BOT_TOKEN) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const msg = body?.message;
    if (!msg) {
      return NextResponse.json({ ok: true }); // Not a message update, ignore
    }

    // Extract bot username from token (first part before colon is bot ID, but we need the username)
    // For now, use a reasonable default -- can be made configurable later
    const botUsername = "obol_ai_bot";

    const result = await handleMessage(msg, botUsername);
    if (result) {
      await sendReply(msg.chat.id, result.text, result.replyToMessageId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[TG-BOT] Webhook error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram to prevent retries
  }
}
