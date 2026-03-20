import { NextResponse } from "next/server";
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
  // TODO: Verify Alchemy webhook signature in production
  const payload = (await req.json()) as AlchemyWebhookPayload;

  for (const activity of payload.event.activity) {
    if (activity.asset !== "USDC") continue;

    const senderAddress = activity.fromAddress;
    const amountUsdc = activity.value;
    const amountMicro = MICRO_USDC(amountUsdc);

    const alreadyProcessed = await SpendEventStore.existsByTxHash(activity.hash);
    if (alreadyProcessed) {
      console.log(`Skipping already-processed tx ${activity.hash}`);
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
      console.log(`Credited ${amountUsdc} USDC to ${senderAddress} (tx: ${activity.hash})`);
    } else {
      console.warn(`USDC deposit from unknown wallet ${senderAddress} — no credit account found`);
    }
  }

  return NextResponse.json({ ok: true });
}
