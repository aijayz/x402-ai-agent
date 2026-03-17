import { Account, toAccount } from "viem/accounts";
import { CdpClient } from "@coinbase/cdp-sdk";
import { base, baseSepolia } from "viem/chains";
import { createPublicClient, http } from "viem";
import { env } from "./env";

let cdp: CdpClient | null = null;

function getCdpClient() {
  if (!cdp) {
    cdp = new CdpClient();
  }
  return cdp;
}

const chainMap = {
  "base-sepolia": baseSepolia,
  base: base,
} as const;

export function getChain() {
  return chainMap[env.NETWORK];
}

function getPublicClient() {
  return createPublicClient({
    chain: getChain(),
    transport: http(),
  });
}

// Cache the raw CDP account to avoid repeated getOrCreateAccount calls
let cachedPurchaserAccount: Awaited<
  ReturnType<ReturnType<typeof getCdpClient>["evm"]["getOrCreateAccount"]>
> | null = null;

export async function getOrCreatePurchaserAccount(): Promise<Account> {
  if (cachedPurchaserAccount) return toAccount(cachedPurchaserAccount);

  const cdpClient = getCdpClient();
  cachedPurchaserAccount = await cdpClient.evm.getOrCreateAccount({
    name: "Purchaser",
  });

  // Fire-and-forget faucet funding — do NOT block the request
  ensurePurchaserFunded(cdpClient, cachedPurchaserAccount).catch((err) =>
    console.error("Faucet funding failed:", err)
  );

  return toAccount(cachedPurchaserAccount);
}

async function ensurePurchaserFunded(
  cdpClient: ReturnType<typeof getCdpClient>,
  account: NonNullable<typeof cachedPurchaserAccount>
) {
  if (env.NETWORK !== "base-sepolia") return;

  const balances = await account.listTokenBalances({
    network: env.NETWORK,
  });
  const usdcBalance = balances.balances.find(
    (balance) => balance.token.symbol === "USDC"
  );
  if (usdcBalance && Number(usdcBalance.amount) >= 500000) return;

  console.log("Requesting faucet funds for purchaser wallet...");
  const { transactionHash } = await cdpClient.evm.requestFaucet({
    address: account.address,
    network: env.NETWORK,
    token: "usdc",
  });
  const publicClient = getPublicClient();
  const tx = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (tx.status !== "success") {
    throw new Error("Failed to receive funds from faucet");
  }
  console.log("Faucet funded purchaser wallet");
}

export async function getOrCreateSellerAccount(): Promise<Account> {
  const cdpClient = getCdpClient();
  const account = await cdpClient.evm.getOrCreateAccount({
    name: "Seller",
  });
  return toAccount(account);
}
