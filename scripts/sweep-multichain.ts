#!/usr/bin/env npx tsx
/**
 * Sweep USDC from CDP-managed wallets on non-Base chains.
 *
 * Usage:
 *   npx tsx scripts/sweep-multichain.ts --to 0xYourAddress --dry-run
 *   npx tsx scripts/sweep-multichain.ts --to 0xYourAddress --chain ethereum
 *   npx tsx scripts/sweep-multichain.ts --to 0xYourAddress
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, parseAbi, formatUnits, type Hex } from "viem";
import { mainnet, arbitrum, optimism } from "viem/chains";
import { toAccount } from "viem/accounts";
import { createWalletClient } from "viem";

const CHAINS = {
  ethereum: {
    name: "Ethereum",
    cdpNetwork: "ethereum",
    viemChain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Hex,
    rpcUrl: "https://eth.llamarpc.com",
  },
  arbitrum: {
    name: "Arbitrum",
    cdpNetwork: "arbitrum",
    viemChain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Hex,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    name: "Optimism",
    cdpNetwork: "optimism",
    viemChain: optimism,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Hex,
    rpcUrl: "https://mainnet.optimism.io",
  },
} as const;

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const SWEEP_THRESHOLD_MICRO = 50_000_000; // $50 USDC

// Parse args
const args = process.argv.slice(2);
const toIndex = args.indexOf("--to");
const chainIndex = args.indexOf("--chain");
const dryRun = args.includes("--dry-run");

const targetAddress = toIndex >= 0 ? args[toIndex + 1] : null;
const chainFilter = chainIndex >= 0 ? args[chainIndex + 1] : null;

if (!targetAddress || !/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
  console.error("Usage: npx tsx scripts/sweep-multichain.ts --to 0xAddress [--chain ethereum|arbitrum|optimism] [--dry-run]");
  process.exit(1);
}

async function main() {
  console.log(`Target: ${targetAddress}`);
  console.log(`Threshold: $${SWEEP_THRESHOLD_MICRO / 1_000_000} USDC`);
  if (dryRun) console.log("MODE: DRY RUN\n");

  const cdp = new CdpClient();
  const chainsToSweep = chainFilter
    ? { [chainFilter]: CHAINS[chainFilter as keyof typeof CHAINS] }
    : CHAINS;

  for (const [key, chain] of Object.entries(chainsToSweep)) {
    if (!chain) {
      console.error(`Unknown chain: ${key}`);
      continue;
    }

    console.log(`\n--- ${chain.name} ---`);

    const publicClient = createPublicClient({
      chain: chain.viemChain,
      transport: http(chain.rpcUrl),
    });

    // Get purchaser address from CDP (network-scoped for signing)
    const cdpAccount = await cdp.evm.getOrCreateAccount({
      name: "Purchaser",
      network: chain.cdpNetwork,
    });
    const address = cdpAccount.address as Hex;
    console.log(`  Address: ${address}`);

    const balance = await publicClient.readContract({
      address: chain.usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    const balanceFormatted = formatUnits(balance, 6);
    console.log(`  USDC balance: ${balanceFormatted}`);

    if (Number(balance) < SWEEP_THRESHOLD_MICRO) {
      console.log(`  Below threshold ($${SWEEP_THRESHOLD_MICRO / 1_000_000}), skipping.`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would transfer ${balanceFormatted} USDC to ${targetAddress}`);
      continue;
    }

    console.log(`  Sweeping ${balanceFormatted} USDC to ${targetAddress}...`);

    // Use CDP account on the target network for signing
    const viemAccount = toAccount(cdpAccount);
    const walletClient = createWalletClient({
      account: viemAccount,
      chain: chain.viemChain,
      transport: http(chain.rpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: chain.usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [targetAddress as Hex, balance],
    });

    console.log(`  Tx: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  Status: ${receipt.status === "success" ? "confirmed" : "FAILED"}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Multi-chain sweep failed:", err);
  process.exit(1);
});
