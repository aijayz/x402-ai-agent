import { checkGroupLimit } from "./rate-limit";
import { getPrice, getWhaleData, getSecurity, getAlpha } from "./data";
import { formatPrice, formatWhales, formatSecurity, formatAlpha, formatRateLimited, formatError } from "./responses";

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
}

interface CommandResult {
  text: string;
  replyToMessageId: number;
}

/** Extract the command and argument from a message */
function parseCommand(msg: TelegramMessage): { command: string; arg: string } | null {
  if (!msg.text) return null;

  // Check for /command
  const cmdMatch = msg.text.match(/^\/(\w+)(?:@\w+)?\s*(.*)/);
  if (cmdMatch) {
    return { command: cmdMatch[1].toLowerCase(), arg: cmdMatch[2].trim() };
  }

  return null;
}

/** Check if the bot is mentioned in the message */
function isBotMentioned(msg: TelegramMessage, botUsername: string): boolean {
  if (!msg.text || !msg.entities) return false;
  return msg.entities.some(
    (e) => e.type === "mention" && msg.text!.substring(e.offset, e.offset + e.length).toLowerCase() === `@${botUsername.toLowerCase()}`
  );
}

/** Route a message to the appropriate handler. Returns null if the message is not for the bot. */
export async function handleMessage(msg: TelegramMessage, botUsername: string): Promise<CommandResult | null> {
  const chatId = msg.chat.id;

  // Try command first
  const parsed = parseCommand(msg);
  if (parsed) {
    const { command, arg } = parsed;

    switch (command) {
      case "price": {
        if (!arg) return { text: "Usage: /price ETH", replyToMessageId: msg.message_id };
        const allowed = await checkGroupLimit(chatId, "free");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const data = await getPrice(arg);
        if (!data) return { text: `No data found for ${arg.toUpperCase()}`, replyToMessageId: msg.message_id };
        return { text: formatPrice(data), replyToMessageId: msg.message_id };
      }

      case "safe": {
        if (!arg) return { text: "Usage: /safe PEPE", replyToMessageId: msg.message_id };
        const allowed = await checkGroupLimit(chatId, "safe");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const sec = await getSecurity(arg);
        if (!sec) return { text: `No security data for ${arg.toUpperCase()}`, replyToMessageId: msg.message_id };
        return { text: formatSecurity(arg.toUpperCase(), sec), replyToMessageId: msg.message_id };
      }

      case "whales": {
        if (!arg) return { text: "Usage: /whales ETH", replyToMessageId: msg.message_id };
        const allowed = await checkGroupLimit(chatId, "free");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const flow = await getWhaleData(arg);
        if (!flow) return { text: `No whale data for ${arg.toUpperCase()}`, replyToMessageId: msg.message_id };
        return { text: formatWhales(arg.toUpperCase(), flow), replyToMessageId: msg.message_id };
      }

      case "alpha": {
        const allowed = await checkGroupLimit(chatId, "free");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const alpha = await getAlpha();
        if (!alpha) return { text: "No digest available today yet.", replyToMessageId: msg.message_id };
        return { text: formatAlpha(alpha), replyToMessageId: msg.message_id };
      }

      case "start":
      case "help": {
        return {
          text: [
            "Obol AI -- On-chain intelligence bot",
            "",
            "/price <token> -- Price + 24h change",
            "/safe <token> -- Quick security score",
            "/whales <token> -- Whale flow summary",
            "/alpha -- Today's top insight",
            "",
            "Or mention me with a question!",
          ].join("\n"),
          replyToMessageId: msg.message_id,
        };
      }

      default:
        return null; // Unknown command, ignore
    }
  }

  // Check for @mention (free-form question)
  if (isBotMentioned(msg, botUsername)) {
    const allowed = await checkGroupLimit(chatId, "mention");
    if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
    // For now, redirect to web -- full orchestrator integration is Phase 2
    return {
      text: formatError() + "\n\nFree-form AI answers coming soon!",
      replyToMessageId: msg.message_id,
    };
  }

  return null; // Not for the bot
}
