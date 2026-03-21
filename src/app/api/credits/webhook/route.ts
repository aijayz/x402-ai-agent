import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { env } from "@/lib/env";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";

interface AlchemyWebhookPayload {
  webhookId: string;
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      value: number;
      asset: string;
      hash: string;
    }>;
  };
}

export async function POST(req: Request) {
  // Webhook is disabled until ALCHEMY_WEBHOOK_SIGNING_KEY is configured
  if (!env.ALCHEMY_WEBHOOK_SIGNING_KEY) {
    return new Response("Webhook not configured", { status: 501 });
  }

  // Verify Alchemy HMAC-SHA256 signature
  const signature = req.headers.get("x-alchemy-signature");
  const rawBody = await req.text();

  const expectedSig = createHmac("sha256", env.ALCHEMY_WEBHOOK_SIGNING_KEY)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSig) {
    console.warn("[WEBHOOK] Invalid Alchemy signature — rejecting request");
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as AlchemyWebhookPayload;

  for (const activity of payload.event.activity) {
    if (activity.asset !== "USDC") continue;

    const senderAddress = activity.fromAddress;
    const amountUsdc = activity.value;
    const amountMicro = MICRO_USDC(amountUsdc);

    try {
      const alreadyProcessed = await SpendEventStore.existsByTxHash(activity.hash);
      if (alreadyProcessed) {
        console.log(`[WEBHOOK] Skipping already-processed tx ${activity.hash}`);
        continue;
      }

      const account = await CreditStore.get(senderAddress);
      if (account) {
        await CreditStore.credit(senderAddress, amountMicro);
        await SpendEventStore.record({
          walletAddress: senderAddress,
          toolName: "topup",
          serviceCostMicroUsdc: 0,
          chargedAmountMicroUsdc: -amountMicro,
          markupBps: 0,
          txHash: activity.hash,
        });
        console.log(`[WEBHOOK] Credited ${amountUsdc} USDC to ${senderAddress} (tx: ${activity.hash})`);
      } else {
        console.warn(`[WEBHOOK] USDC deposit from unknown wallet ${senderAddress} — no credit account found`);
      }
    } catch (err) {
      // Log but continue processing other activities in the batch
      console.error("[WEBHOOK] Failed to process activity", {
        hash: activity.hash,
        sender: senderAddress,
        amount: amountUsdc,
        error: err,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
