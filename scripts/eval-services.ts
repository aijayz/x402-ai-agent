/**
 * x402 Service Quality Evaluation
 *
 * Calls each service adapter on mainnet with known test inputs,
 * logs raw responses, timing, and cost to reports/service-eval.json.
 *
 * Usage:
 *   NETWORK=base npx tsx scripts/eval-services.ts
 *   NETWORK=base npx tsx scripts/eval-services.ts --service qs-token-security
 *   NETWORK=base npx tsx scripts/eval-services.ts --dry-run
 *
 * Requires: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET in .env.local
 * Cost: ~$0.50-$1.00 for a full run
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { CdpClient } from "@coinbase/cdp-sdk";
import { toAccount } from "viem/accounts";

// Load env
const envPath = resolve(__dirname, "../.env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env.local */ }

// Force mainnet
process.env.NETWORK = "base";
process.env.NEXT_PUBLIC_NETWORK = "base";

// Test inputs
const WETH = "0x4200000000000000000000000000000000000006";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const RANDOM_WALLET = "0x28C6c06298d514Db089934071355E5743bf21d60"; // Binance 14

interface TestCase {
  service: string;
  input: Record<string, unknown>;
  description: string;
}

const TEST_CASES: TestCase[] = [
  // Augur — contract risk scoring
  { service: "augur", input: { address: WETH }, description: "WETH risk score" },
  { service: "augur", input: { address: AERO }, description: "AERO risk score" },

  // SLAMai — wallet trades
  { service: "slamai-wallet", input: { address: VITALIK }, description: "Vitalik wallet profile" },
  { service: "slamai-wallet", input: { address: RANDOM_WALLET }, description: "Binance wallet profile" },

  // SLAMai — token holders
  { service: "slamai-token-holders", input: { address: WETH }, description: "WETH top holders" },
  { service: "slamai-token-holders", input: { address: AERO }, description: "AERO top holders" },

  // GenVox — sentiment
  { service: "genvox", input: { topic: "bitcoin" }, description: "Bitcoin sentiment" },
  { service: "genvox", input: { topic: "ethereum" }, description: "Ethereum sentiment" },

  // QuantumShield — token security
  { service: "qs-token-security", input: { address: WETH }, description: "WETH token security" },
  { service: "qs-token-security", input: { address: AERO }, description: "AERO token security" },

  // QuantumShield — contract audit
  { service: "qs-contract-audit", input: { address: USDC_BASE }, description: "USDC contract audit" },

  // QuantumShield — wallet risk
  { service: "qs-wallet-risk", input: { address: VITALIK }, description: "Vitalik wallet risk" },

  // QuantumShield — whale activity
  { service: "qs-whale-activity", input: { address: WETH }, description: "WETH whale activity" },

  // Messari — token unlocks (free)
  { service: "messari-token-unlocks", input: { target: "ethereum" }, description: "ETH token unlocks" },
  { service: "messari-token-unlocks", input: { target: "arbitrum" }, description: "ARB token unlocks" },
];

interface EvalResult {
  service: string;
  description: string;
  input: Record<string, unknown>;
  status: "success" | "error" | "skipped";
  httpStatus?: number;
  responseTimeMs: number;
  costMicroUsdc: number;
  dataPreview: unknown;
  error?: string;
  hasData: boolean;
  dataKeys?: string[];
  timestamp: string;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const serviceFilter = args.includes("--service")
    ? args[args.indexOf("--service") + 1]
    : null;

  console.log("=== x402 Service Quality Evaluation ===\n");
  console.log(`Network: ${process.env.NETWORK}`);
  console.log(`Dry run: ${dryRun}`);
  if (serviceFilter) console.log(`Filter: ${serviceFilter}`);
  console.log();

  const cases = serviceFilter
    ? TEST_CASES.filter(tc => tc.service === serviceFilter)
    : TEST_CASES;

  if (cases.length === 0) {
    console.error(`No test cases for service: ${serviceFilter}`);
    console.log("Available:", [...new Set(TEST_CASES.map(tc => tc.service))].join(", "));
    process.exit(1);
  }

  // Estimate cost
  const costEstimate: Record<string, number> = {
    "augur": 100_000,
    "slamai-wallet": 1_000,
    "slamai-token-holders": 1_000,
    "genvox": 30_000,
    "qs-token-security": 2_000,
    "qs-contract-audit": 3_000,
    "qs-wallet-risk": 2_000,
    "qs-whale-activity": 2_000,
    "messari-token-unlocks": 0,
  };
  const totalEstimate = cases.reduce((sum, tc) => sum + (costEstimate[tc.service] ?? 0), 0);
  console.log(`Estimated cost: $${(totalEstimate / 1_000_000).toFixed(4)} USDC (${cases.length} calls)\n`);

  if (dryRun) {
    console.log("Test cases:");
    for (const tc of cases) {
      console.log(`  ${tc.service}: ${tc.description}`);
    }
    console.log("\nRun without --dry-run to execute.");
    return;
  }

  // Initialize CDP wallet client
  console.log("Initializing CDP wallet...");
  const cdpClient = new CdpClient();
  const cdpAccount = await cdpClient.evm.getOrCreateAccount({ name: "Purchaser" });
  const account = toAccount(cdpAccount);
  console.log(`Wallet: ${account.address}\n`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  const ctx = { walletClient: walletClient as any, userWallet: null };

  // Dynamic import to get adapters after env is loaded
  const { getService } = await import("../src/lib/services/registry");

  const results: EvalResult[] = [];
  let totalCost = 0;

  for (const tc of cases) {
    const label = `[${tc.service}] ${tc.description}`;
    process.stdout.write(`${label}...`);

    const start = Date.now();
    let result: EvalResult;

    try {
      const adapter = await getService(tc.service as any);
      const response = await adapter.call(tc.input, ctx);
      const elapsed = Date.now() - start;
      totalCost += response.cost;

      const data = response.data;
      const hasData = data !== null && data !== undefined
        && (typeof data !== "object" || Object.keys(data as object).length > 0);
      const dataKeys = typeof data === "object" && data !== null
        ? Object.keys(data as object)
        : undefined;

      // Truncate large responses for the preview
      const preview = JSON.stringify(data);
      const dataPreview = preview.length > 2000
        ? JSON.parse(preview.slice(0, 2000) + '..."')
        : data;

      result = {
        service: tc.service,
        description: tc.description,
        input: tc.input,
        status: "success",
        responseTimeMs: elapsed,
        costMicroUsdc: response.cost,
        dataPreview,
        hasData,
        dataKeys,
        timestamp: new Date().toISOString(),
      };

      console.log(` ✓ ${elapsed}ms, $${(response.cost / 1_000_000).toFixed(4)}, ${dataKeys?.length ?? 0} keys`);
    } catch (err) {
      const elapsed = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);

      result = {
        service: tc.service,
        description: tc.description,
        input: tc.input,
        status: "error",
        responseTimeMs: elapsed,
        costMicroUsdc: 0,
        dataPreview: null,
        hasData: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      };

      console.log(` ✗ ${elapsed}ms — ${errorMsg.slice(0, 100)}`);
    }

    results.push(result);
  }

  // Summary
  console.log("\n=== Summary ===\n");

  const services = [...new Set(results.map(r => r.service))];
  for (const svc of services) {
    const svcResults = results.filter(r => r.service === svc);
    const successes = svcResults.filter(r => r.status === "success");
    const failures = svcResults.filter(r => r.status === "error");
    const avgTime = successes.length > 0
      ? Math.round(successes.reduce((s, r) => s + r.responseTimeMs, 0) / successes.length)
      : 0;
    const cost = svcResults.reduce((s, r) => s + r.costMicroUsdc, 0);
    const hasUseful = successes.some(r => r.hasData);

    const status = failures.length === svcResults.length ? "FAIL"
      : !hasUseful ? "EMPTY"
      : "OK";

    const icon = status === "OK" ? "✓" : status === "EMPTY" ? "⚠" : "✗";
    console.log(`  ${icon} ${svc}: ${successes.length}/${svcResults.length} ok, avg ${avgTime}ms, $${(cost / 1_000_000).toFixed(4)} [${status}]`);
  }

  console.log(`\nTotal cost: $${(totalCost / 1_000_000).toFixed(4)} USDC`);

  // Write results
  mkdirSync(resolve(__dirname, "../reports"), { recursive: true });
  const outPath = resolve(__dirname, "../reports/service-eval.json");
  writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    network: process.env.NETWORK,
    wallet: account.address,
    totalCostMicroUsdc: totalCost,
    totalCases: results.length,
    results,
  }, null, 2));

  console.log(`\nResults saved to: ${outPath}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
