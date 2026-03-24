import { ConversationStore } from "@/lib/credits/conversation-store";
import { NextResponse } from "next/server";
import { getVerifiedWallet } from "@/lib/wallet-auth";

/** GET /api/conversations/[id] — load a single conversation */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const walletAddress = getVerifiedWallet(request);
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await ConversationStore.get(id, walletAddress);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

/** DELETE /api/conversations/[id] — delete a conversation */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const walletAddress = getVerifiedWallet(request);
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await ConversationStore.delete(id, walletAddress);
  if (!deleted) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
