#!/usr/bin/env npx tsx
/**
 * Sweep USDC and/or ETH from CDP-managed wallets to a cold wallet.
 *
 * Usage:
 *   npx tsx scripts/sweep.ts --to 0xYourColdWallet
 *   npx tsx scripts/sweep.ts --to 0xYourColdWallet --wallet purchaser
 *   npx tsx scripts/sweep.ts --to 0xYourColdWallet --wallet seller
 *   npx tsx scripts/sweep.ts --to 0xYourColdWallet --wallet both
 *   npx tsx scripts/sweep.ts --to 0xYourColdWallet --dry-run
 *
 * Requires CDP env vars: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 * Reads from .env.local automatically.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, parseAbi, formatUnits, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { toAccount } from "viem/accounts";
import { createWalletClient } from "viem";

// --- Config ---

const USDC_ADDRESS: Record<string, Hex> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const network = process.env.NETWORK || "base-sepolia";
const chain = network === "base" ? base : baseSepolia;
const usdcAddress = USDC_ADDRESS[network];

// --- Parse args ---

const args = process.argv.slice(2);
const toIndex = args.indexOf("--to");
const walletIndex = args.indexOf("--wallet");
const dryRun = args.includes("--dry-run");

const coldWallet = toIndex >= 0 ? args[toIndex + 1] : null;
const walletFilter = walletIndex >= 0 ? args[walletIndex + 1] : "both";

if (!coldWallet || !/^0x[a-fA-F0-9]{40}$/.test(coldWallet)) {
  console.error("Usage: npx tsx scripts/sweep.ts --to 0xYourColdWallet [--wallet purchaser|seller|both] [--dry-run]");
  process.exit(1);
}

// --- Helpers ---

const publicClient = createPublicClient({ chain, transport: http() });

async function getUsdcBalance(address: Hex): Promise<bigint> {
  return publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

async function getEthBalance(address: Hex): Promise<bigint> {
  return publicClient.getBalance({ address });
}

async function sweepWallet(name: string, cdpAccount: any) {
  const address = cdpAccount.address as Hex;
  console.log(`\n--- ${name} Wallet: ${address} ---`);

  // Check USDC balance
  const usdcBalance = await getUsdcBalance(address);
  const ethBalance = await getEthBalance(address);

  console.log(`  USDC: ${formatUnits(usdcBalance, 6)}`);
  console.log(`  ETH:  ${formatUnits(ethBalance, 18)}`);

  if (usdcBalance === 0n && ethBalance === 0n) {
    console.log(`  Nothing to sweep.`);
    return;
  }

  const viemAccount = toAccount(cdpAccount);
  const walletClient = createWalletClient({
    account: viemAccount,
    chain,
    transport: http(),
  });

  // Sweep USDC
  if (usdcBalance > 0n) {
    console.log(`  Sweeping ${formatUnits(usdcBalance, 6)} USDC to ${coldWallet}...`);
    if (dryRun) {
      console.log(`  [DRY RUN] Would transfer ${formatUnits(usdcBalance, 6)} USDC`);
    } else {
      const txHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [coldWallet as Hex, usdcBalance],
      });
      console.log(`  USDC tx: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`  Status: ${receipt.status === "success" ? "confirmed" : "FAILED"}`);
    }
  }

  // Sweep ETH (leave a small amount for gas on future operations)
  // Only sweep if > 0.001 ETH to avoid dust
  const ethThreshold = 1_000_000_000_000_000n; // 0.001 ETH
  if (ethBalance > ethThreshold) {
    // Estimate gas cost and subtract from transfer amount
    const gasPrice = await publicClient.getGasPrice();
    const gasCost = gasPrice * 21000n * 2n; // 2x buffer for safety
    const sweepAmount = ethBalance - gasCost;

    if (sweepAmount > 0n) {
      console.log(`  Sweeping ${formatUnits(sweepAmount, 18)} ETH to ${coldWallet}...`);
      if (dryRun) {
        console.log(`  [DRY RUN] Would transfer ${formatUnits(sweepAmount, 18)} ETH`);
      } else {
        const txHash = await walletClient.sendTransaction({
          to: coldWallet as Hex,
          value: sweepAmount,
        });
        console.log(`  ETH tx: ${txHash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`  Status: ${receipt.status === "success" ? "confirmed" : "FAILED"}`);
      }
    }
  }
}

// --- Main ---

async function main() {
  console.log(`Network: ${network}`);
  console.log(`Cold wallet: ${coldWallet}`);
  console.log(`Sweep: ${walletFilter}`);
  if (dryRun) console.log(`MODE: DRY RUN (no transactions will be sent)`);

  const cdp = new CdpClient();

  if (walletFilter === "purchaser" || walletFilter === "both") {
    const purchaser = await cdp.evm.getOrCreateAccount({ name: "Purchaser" });
    await sweepWallet("Purchaser", purchaser);
  }

  if (walletFilter === "seller" || walletFilter === "both") {
    const seller = await cdp.evm.getOrCreateAccount({ name: "Seller" });
    await sweepWallet("Seller", seller);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Sweep failed:", err);
  process.exit(1);
});
