import { createHmac } from "crypto";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { sendTelegramAlert } from "@/lib/telegram";
import { getChainConfig, type ChainKey } from "@/lib/chains";
import { env } from "@/lib/env";

interface AlchemyActivity {
  fromAddress: string;
  toAddress: string;
  value: number;
  asset: string;
  hash: string;
  category: string;
  rawContract?: {
    rawValue: string;
    address: string;
    decimals: number;
  };
}

interface AlchemyWebhookPayload {
  webhookId: string;
  event: {
    network: string;
    activity: AlchemyActivity[];
  };
}

/** Get the Alchemy webhook signing key for a given chain. */
function getWebhookKey(chain: ChainKey): string | undefined {
  const keyMap: Record<ChainKey, string | undefined> = {
    base: env.ALCHEMY_WEBHOOK_KEY_BASE,
    ethereum: env.ALCHEMY_WEBHOOK_KEY_ETHEREUM,
    arbitrum: env.ALCHEMY_WEBHOOK_KEY_ARBITRUM,
    optimism: env.ALCHEMY_WEBHOOK_KEY_OPTIMISM,
  };
  return keyMap[chain];
}

/**
 * Handle an Alchemy webhook request for a specific chain.
 * Verifies signature, parses USDC transfers to our deposit address,
 * credits user balances, and sends Telegram alerts.
 */
export async function handleDepositWebhook(
  chainKey: ChainKey,
  req: Request
): Promise<Response> {
  const webhookKey = getWebhookKey(chainKey);
  if (!webhookKey) {
    return new Response("Webhook not configured", { status: 501 });
  }

  // Verify Alchemy HMAC-SHA256 signature
  const signature = req.headers.get("x-alchemy-signature");
  const rawBody = await req.text();

  const expectedSig = createHmac("sha256", webhookKey)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSig) {
    console.warn(`[WEBHOOK:${chainKey}] Invalid Alchemy signature — rejecting`);
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as AlchemyWebhookPayload;
  const chainConfig = getChainConfig(chainKey, env.NETWORK);
  if (!chainConfig) {
    console.error(`[WEBHOOK:${chainKey}] No chain config found for network ${env.NETWORK}`);
    return new Response("Chain not configured", { status: 500 });
  }

  const depositAddress = chainConfig.depositAddress.toLowerCase();

  const usdcAddress = chainConfig.usdcAddress.toLowerCase();

  for (const activity of payload.event.activity) {
    // Only process ERC20 token transfers of USDC to our deposit address
    if (activity.category !== "token") continue;
    if (activity.asset !== "USDC") continue;
    if (activity.rawContract?.address?.toLowerCase() !== usdcAddress) continue;
    if (activity.toAddress.toLowerCase() !== depositAddress) continue;

    const senderAddress = activity.fromAddress;
    const amountUsdc = activity.value;
    // USDC has 6 decimals — Alchemy reports value as a float
    const amountMicro = MICRO_USDC(amountUsdc);

    try {
      const alreadyProcessed = await SpendEventStore.existsByTxHashAndChain(
        activity.hash,
        chainKey
      );
      if (alreadyProcessed) {
        console.log(`[WEBHOOK:${chainKey}] Skipping already-processed tx ${activity.hash}`);
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
          sourceChain: chainKey,
        });

        const depositUsdc = (amountMicro / 1_000_000).toFixed(2);
        const newBalance = await CreditStore.get(senderAddress);
        await sendTelegramAlert(
          `*Top-Up Received (${chainConfig.name})*\n\nWallet: \`${senderAddress}\`\nDeposit: *$${depositUsdc}* USDC\nNew balance: $${((newBalance?.balanceMicroUsdc ?? 0) / 1_000_000).toFixed(2)}\nChain: ${chainConfig.name}\nTx: \`${activity.hash}\``
        );

        console.log(`[WEBHOOK:${chainKey}] Credited ${amountUsdc} USDC to ${senderAddress} (tx: ${activity.hash})`);
      } else {
        console.warn(`[WEBHOOK:${chainKey}] USDC deposit from unknown wallet ${senderAddress}`);
      }
    } catch (err) {
      console.error(`[WEBHOOK:${chainKey}] Failed to process activity`, {
        hash: activity.hash,
        sender: senderAddress,
        amount: amountUsdc,
        error: err,
      });
    }
  }

  return Response.json({ ok: true });
}
