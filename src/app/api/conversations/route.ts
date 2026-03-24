import { ConversationStore } from "@/lib/credits/conversation-store";
import { NextResponse } from "next/server";
import { getVerifiedWallet } from "@/lib/wallet-auth";

const MAX_MESSAGES = 200;
const MAX_PAYLOAD_BYTES = 512_000; // 500KB

/** GET /api/conversations — list conversations for authenticated wallet */
export async function GET(request: Request) {
  const walletAddress = getVerifiedWallet(request);
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || undefined;

  const conversations = await ConversationStore.list(walletAddress, 50, query);
  return NextResponse.json({ conversations });
}

/** POST /api/conversations — create or update a conversation */
export async function POST(request: Request) {
  const walletAddress = getVerifiedWallet(request);
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  }

  // Guard against oversized payloads
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = await request.json();
  const { id, title, messages } = body as {
    id?: string;
    title?: string;
    messages?: unknown[];
  };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `Too many messages (max ${MAX_MESSAGES})` }, { status: 400 });
  }

  // Update existing conversation
  if (id) {
    const updated = await ConversationStore.update(id, walletAddress, { title, messages });
    if (!updated) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json({ id });
  }

  // Create new conversation — auto-generate title from first user message
  const autoTitle = title || deriveTitle(messages);
  const newId = await ConversationStore.create(walletAddress, autoTitle, messages);
  return NextResponse.json({ id: newId }, { status: 201 });
}

/** Derive a short title from the first user message text. */
function deriveTitle(messages: unknown[]): string {
  for (const msg of messages) {
    const m = msg as { role?: string; parts?: Array<{ type?: string; text?: string }> };
    if (m.role === "user" && m.parts) {
      const text = m.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .trim();
      if (text) {
        return text.length > 60 ? text.slice(0, 57) + "..." : text;
      }
    }
  }
  return "New conversation";
}
