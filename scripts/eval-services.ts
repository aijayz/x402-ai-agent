/**
 * x402 Service Quality Evaluation
 *
 * Two modes:
 *   1. Adapter tests — calls existing service adapters via registry (pays + gets data)
 *   2. Raw x402 probe — hits new candidate endpoints to verify 402 response + payment flow
 *
 * Usage:
 *   NETWORK=base npx tsx scripts/eval-services.ts
 *   NETWORK=base npx tsx scripts/eval-services.ts --service qs-token-security
 *   NETWORK=base npx tsx scripts/eval-services.ts --probe-only   # only test new candidates
 *   NETWORK=base npx tsx scripts/eval-services.ts --dry-run
 *
 * Requires: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET in .env.local
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

// ─── Part 1: Existing adapter-based tests ───

interface TestCase {
  service: string;
  input: Record<string, unknown>;
  description: string;
}

const TEST_CASES: TestCase[] = [
  // Augur — contract risk scoring (x402 v2)
  { service: "augur", input: { address: WETH }, description: "WETH risk score" },
  { service: "augur", input: { address: AERO }, description: "AERO risk score" },

  // QuantumShield — token security
  { service: "qs-token-security", input: { address: WETH }, description: "WETH token security" },
  { service: "qs-token-security", input: { address: AERO }, description: "AERO token security" },

  // QuantumShield — contract audit
  { service: "qs-contract-audit", input: { address: USDC_BASE }, description: "USDC contract audit" },

  // QuantumShield — wallet risk
  { service: "qs-wallet-risk", input: { address: VITALIK }, description: "Vitalik wallet risk" },

  // Messari — token unlocks (free)
  { service: "messari-token-unlocks", input: { target: "ethereum" }, description: "ETH token unlocks" },
  { service: "messari-token-unlocks", input: { target: "arbitrum" }, description: "ARB token unlocks" },
];

// ─── Part 2: Raw x402 probes for new candidate services ───

interface ProbeCase {
  name: string;
  description: string;
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  expectedCostMicroUsdc: number;
  /** If true, attempt payment after 402 (costs real USDC). If false, just verify 402 response. */
  attemptPayment: boolean;
}

const PROBE_CASES: ProbeCase[] = [
  // Neynar — Farcaster social data ($0.01/call)
  {
    name: "neynar-user",
    description: "Neynar: Farcaster user lookup (FID 3 = dwr)",
    url: "https://api.neynar.com/v2/farcaster/user/bulk?fids=3",
    method: "GET",
    expectedCostMicroUsdc: 10_000,
    attemptPayment: true,
  },
  {
    name: "neynar-trending",
    description: "Neynar: trending casts feed",
    url: "https://api.neynar.com/v2/farcaster/feed/trending?limit=5",
    method: "GET",
    expectedCostMicroUsdc: 10_000,
    attemptPayment: true,
  },
  {
    name: "neynar-cast-search",
    description: "Neynar: search casts for 'ethereum'",
    url: "https://api.neynar.com/v2/farcaster/cast/search?q=ethereum&limit=5",
    method: "GET",
    expectedCostMicroUsdc: 10_000,
    attemptPayment: true,
  },

  // BaseWhales — whale intelligence ($0.01/call)
  {
    name: "basewhales-ask",
    description: "BaseWhales: AI whale query",
    url: "https://basewhales.com/api/ask",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What are the biggest whale moves on Base in the last hour?" }),
    expectedCostMicroUsdc: 10_000,
    attemptPayment: true,
  },

  // Messari Allocations — token allocations ($0.25/call, x402 v2)
  {
    name: "messari-allocations",
    description: "Messari: ARB token allocations (x402 v2)",
    url: "https://api.messari.io/token-unlocks/v1/allocations?assetSymbol=ARB",
    method: "GET",
    expectedCostMicroUsdc: 250_000,
    attemptPayment: true,
  },

  // GenVox — social sentiment ($0.03/call, x402 v2)
  {
    name: "genvox-btc",
    description: "GenVox: Bitcoin sentiment",
    url: "https://api.genvox.io/v1/sentiment/bitcoin",
    method: "GET",
    expectedCostMicroUsdc: 30_000,
    attemptPayment: true,
  },
  {
    name: "genvox-eth",
    description: "GenVox: Ethereum sentiment",
    url: "https://api.genvox.io/v1/sentiment/ethereum",
    method: "GET",
    expectedCostMicroUsdc: 30_000,
    attemptPayment: true,
  },

  // SLAMai — wallet + token holder intelligence ($0.001/call)
  {
    name: "slamai-wallet",
    description: "SLAMai: Vitalik wallet trades",
    url: `https://api.slamai.dev/wallet/trades?blockchain=base&wallet_address=${VITALIK}&num=10`,
    method: "GET",
    expectedCostMicroUsdc: 1_000,
    attemptPayment: true,
  },
  {
    name: "slamai-token-holders",
    description: "SLAMai: WETH top holder reputation",
    url: `https://api.slamai.dev/token/holder/reputation?blockchain=base&address=${WETH}`,
    method: "GET",
    expectedCostMicroUsdc: 1_000,
    attemptPayment: true,
  },

  // QuantumShield Whale Activity ($0.002/call)
  {
    name: "qs-whale-activity",
    description: "QS: Whale activity for WETH",
    url: `https://quantumshield-api.vercel.app/api/whale/activity?address=${WETH}`,
    method: "GET",
    expectedCostMicroUsdc: 2_000,
    attemptPayment: true,
  },

  // RugMunch — was 502 before, retest to see if back up
  {
    name: "rugmunch",
    description: "RugMunch: scan WETH (was 502 before)",
    url: `https://cryptorugmunch.app/api/agent/v1/scan?target=${WETH}`,
    method: "GET",
    expectedCostMicroUsdc: 20_000,
    attemptPayment: true,
  },

  // DiamondClaws — was 530 before, retest to see if back up
  {
    name: "diamondclaws",
    description: "DiamondClaws: score WETH (was 530 before)",
    url: `https://diamondclaws.io/score?target=${WETH}`,
    method: "GET",
    expectedCostMicroUsdc: 1_000,
    attemptPayment: true,
  },
];

// ─── Shared types ───

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

interface ProbeResult {
  name: string;
  description: string;
  url: string;
  phase1_402: {
    status: number;
    hasX402Body: boolean;
    hasPaymentRequiredHeader: boolean;
    x402Version: number | null;
    network: string | null;
    costMicroUsdc: number | null;
    payTo: string | null;
  } | null;
  phase2_payment: {
    status: number;
    hasData: boolean;
    dataPreview: unknown;
    dataKeys: string[];
    txHash: string | null;
  } | null;
  status: "x402-verified" | "x402-payment-ok" | "x402-payment-failed" | "not-x402" | "error";
  responseTimeMs: number;
  costMicroUsdc: number;
  error?: string;
  timestamp: string;
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const probeOnly = args.includes("--probe-only");
  const adapterOnly = args.includes("--adapter-only");
  const serviceFilter = args.includes("--service")
    ? args[args.indexOf("--service") + 1]
    : null;

  console.log("=== x402 Service Quality Evaluation ===\n");
  console.log(`Network: ${process.env.NETWORK}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Mode: ${probeOnly ? "probe-only" : adapterOnly ? "adapter-only" : "full"}`);
  if (serviceFilter) console.log(`Filter: ${serviceFilter}`);
  console.log();

  // Filter cases
  const adapterCases = probeOnly ? [] : (
    serviceFilter
      ? TEST_CASES.filter(tc => tc.service === serviceFilter)
      : TEST_CASES
  );
  const probeCases = adapterOnly ? [] : (
    serviceFilter
      ? PROBE_CASES.filter(pc => pc.name === serviceFilter)
      : PROBE_CASES
  );

  if (adapterCases.length === 0 && probeCases.length === 0) {
    console.error(`No test cases for: ${serviceFilter}`);
    console.log("Adapters:", [...new Set(TEST_CASES.map(tc => tc.service))].join(", "));
    console.log("Probes:", PROBE_CASES.map(pc => pc.name).join(", "));
    process.exit(1);
  }

  // Cost estimate
  const costEstimate: Record<string, number> = {
    "augur": 100_000,
    "qs-token-security": 2_000,
    "qs-contract-audit": 3_000,
    "qs-wallet-risk": 2_000,
    "messari-token-unlocks": 0,
  };
  const adapterEstimate = adapterCases.reduce((sum, tc) => sum + (costEstimate[tc.service] ?? 0), 0);
  const probeEstimate = probeCases
    .filter(pc => pc.attemptPayment)
    .reduce((sum, pc) => sum + pc.expectedCostMicroUsdc, 0);
  const totalEstimate = adapterEstimate + probeEstimate;

  console.log(`Adapter tests: ${adapterCases.length} cases (~$${(adapterEstimate / 1_000_000).toFixed(4)})`);
  console.log(`Probe tests: ${probeCases.length} cases (~$${(probeEstimate / 1_000_000).toFixed(4)})`);
  console.log(`Total estimated cost: $${(totalEstimate / 1_000_000).toFixed(4)} USDC\n`);

  if (dryRun) {
    if (adapterCases.length > 0) {
      console.log("Adapter tests:");
      for (const tc of adapterCases) console.log(`  ${tc.service}: ${tc.description}`);
    }
    if (probeCases.length > 0) {
      console.log("Probe tests:");
      for (const pc of probeCases) console.log(`  ${pc.name}: ${pc.description} (~$${(pc.expectedCostMicroUsdc / 1_000_000).toFixed(4)})`);
    }
    console.log("\nRun without --dry-run to execute.");
    return;
  }

  // Initialize CDP wallet
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

  const adapterResults: EvalResult[] = [];
  const probeResults: ProbeResult[] = [];
  let totalCost = 0;

  // ─── Run adapter tests ───
  if (adapterCases.length > 0) {
    console.log("── Adapter Tests ──\n");
    const { getService } = await import("../src/lib/services/registry");

    for (const tc of adapterCases) {
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

        const preview = JSON.stringify(data);
        const dataPreview = preview.length > 2000
          ? preview.slice(0, 2000) + "…[truncated]"
          : data;

        result = {
          service: tc.service, description: tc.description, input: tc.input,
          status: "success", responseTimeMs: elapsed, costMicroUsdc: response.cost,
          dataPreview, hasData, dataKeys, timestamp: new Date().toISOString(),
        };
        console.log(` ✓ ${elapsed}ms, $${(response.cost / 1_000_000).toFixed(4)}, ${dataKeys?.length ?? 0} keys`);
      } catch (err) {
        const elapsed = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        result = {
          service: tc.service, description: tc.description, input: tc.input,
          status: "error", responseTimeMs: elapsed, costMicroUsdc: 0,
          dataPreview: null, hasData: false, error: errorMsg, timestamp: new Date().toISOString(),
        };
        console.log(` ✗ ${elapsed}ms — ${errorMsg.slice(0, 120)}`);
      }

      adapterResults.push(result);
    }
  }

  // ─── Run probe tests ───
  if (probeCases.length > 0) {
    console.log("\n── x402 Probe Tests ──\n");

    // Lazy import x402 client for payment
    const { parse402Response } = await import("../src/lib/x402-client");
    const { x402Client, wrapFetchWithPayment } = await import("@x402/fetch");
    const { toClientEvmSigner } = await import("@x402/evm");
    const { registerExactEvmScheme } = await import("@x402/evm/exact/client");

    // Set up x402 v2 client for probe payments
    const signer = toClientEvmSigner(account as any);
    const x402 = new x402Client();
    registerExactEvmScheme(x402, { signer });
    // Normalizing wrapper: flatten extra.domain → extra for v1 services (QuantumShield)
    const normalizing402: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetch(input, init);
      if (res.status !== 402) return res;
      const body = await res.text();
      let normalized = body;
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed?.accepts)) {
          let changed = false;
          for (const accept of parsed.accepts) {
            if (accept.extra?.domain && !accept.extra.name) {
              accept.extra.name = accept.extra.domain.name;
              accept.extra.version = accept.extra.domain.version;
              changed = true;
            }
          }
          if (changed) normalized = JSON.stringify(parsed);
        }
      } catch { /* not JSON */ }
      return new Response(normalized, { status: res.status, statusText: res.statusText, headers: res.headers });
    }) as typeof fetch;

    const paidFetch = wrapFetchWithPayment(normalizing402, x402);

    for (const pc of probeCases) {
      const label = `[${pc.name}] ${pc.description}`;
      process.stdout.write(`${label}...`);

      const start = Date.now();
      let probeResult: ProbeResult;

      try {
        // Phase 1: Hit endpoint, expect 402
        const res1 = await fetch(pc.url, {
          method: pc.method,
          headers: pc.headers,
          body: pc.method === "POST" ? pc.body : undefined,
          signal: AbortSignal.timeout(15_000),
        });

        if (res1.status !== 402) {
          const elapsed = Date.now() - start;
          const bodyText = await res1.text().catch(() => "");
          probeResult = {
            name: pc.name, description: pc.description, url: pc.url,
            phase1_402: null, phase2_payment: null,
            status: "not-x402", responseTimeMs: elapsed, costMicroUsdc: 0,
            error: `Expected 402, got ${res1.status}. Body: ${bodyText.slice(0, 200)}`,
            timestamp: new Date().toISOString(),
          };
          console.log(` ✗ ${elapsed}ms — not 402 (got ${res1.status})`);
          probeResults.push(probeResult);
          continue;
        }

        // Parse 402 response
        const body402 = await res1.json().catch(() => ({}));
        const paymentRequiredHeader = res1.headers.get("payment-required");
        const parsed = parse402Response(body402, paymentRequiredHeader);

        const phase1 = {
          status: 402,
          hasX402Body: !!(body402 as any)?.x402Version,
          hasPaymentRequiredHeader: !!paymentRequiredHeader,
          x402Version: parsed?.version ?? null,
          network: parsed?.requirements?.network ?? null,
          costMicroUsdc: parsed ? Number(parsed.requirements.maxAmountRequired) : null,
          payTo: parsed?.requirements?.payTo ?? null,
        };

        if (!parsed) {
          const elapsed = Date.now() - start;
          probeResult = {
            name: pc.name, description: pc.description, url: pc.url,
            phase1_402: phase1, phase2_payment: null,
            status: "not-x402", responseTimeMs: elapsed, costMicroUsdc: 0,
            error: "Got 402 but no parseable x402 payment requirements",
            timestamp: new Date().toISOString(),
          };
          console.log(` ⚠ ${elapsed}ms — 402 but no valid x402 body/header`);
          probeResults.push(probeResult);
          continue;
        }

        // Phase 1 success — x402 is live
        const costLabel = `$${((phase1.costMicroUsdc ?? 0) / 1_000_000).toFixed(4)}`;
        console.log(` 402✓ v${phase1.x402Version} ${phase1.network} ${costLabel}`);

        // Phase 2: Attempt payment (if enabled)
        if (!pc.attemptPayment) {
          const elapsed = Date.now() - start;
          probeResult = {
            name: pc.name, description: pc.description, url: pc.url,
            phase1_402: phase1, phase2_payment: null,
            status: "x402-verified", responseTimeMs: elapsed, costMicroUsdc: 0,
            timestamp: new Date().toISOString(),
          };
          probeResults.push(probeResult);
          continue;
        }

        process.stdout.write(` → paying...`);

        // Use x402 v2 wrapped fetch — handles both v1 and v2 payment protocols
        const res2 = await paidFetch(pc.url, {
          method: pc.method,
          headers: pc.headers,
          body: pc.method === "POST" ? pc.body : undefined,
          signal: AbortSignal.timeout(30_000),
        });

        const elapsed = Date.now() - start;

        if (!res2.ok) {
          const errBody = await res2.text().catch(() => "");
          probeResult = {
            name: pc.name, description: pc.description, url: pc.url,
            phase1_402: phase1,
            phase2_payment: { status: res2.status, hasData: false, dataPreview: null, dataKeys: [], txHash: null },
            status: "x402-payment-failed", responseTimeMs: elapsed,
            costMicroUsdc: phase1.costMicroUsdc ?? 0,
            error: `Payment sent but got ${res2.status}: ${errBody.slice(0, 200)}`,
            timestamp: new Date().toISOString(),
          };
          console.log(` ✗ paid but ${res2.status}`);
          totalCost += phase1.costMicroUsdc ?? 0;
          probeResults.push(probeResult);
          continue;
        }

        // Success — got data back
        const data = await res2.json().catch(() => null);
        const hasData = data !== null && typeof data === "object" && Object.keys(data).length > 0;
        const dataKeys = hasData ? Object.keys(data) : [];
        const preview = JSON.stringify(data);
        const dataPreview = preview.length > 2000
          ? preview.slice(0, 2000) + "…[truncated]"
          : data;

        const txHash = res2.headers.get("x-payment-tx")
          ?? res2.headers.get("payment-response")
          ?? null;

        const paidCost = phase1.costMicroUsdc ?? 0;
        totalCost += paidCost;

        probeResult = {
          name: pc.name, description: pc.description, url: pc.url,
          phase1_402: phase1,
          phase2_payment: { status: res2.status, hasData, dataPreview, dataKeys, txHash },
          status: "x402-payment-ok", responseTimeMs: elapsed, costMicroUsdc: paidCost,
          timestamp: new Date().toISOString(),
        };
        console.log(` ✓ ${elapsed}ms, ${costLabel}, ${dataKeys.length} keys`);
      } catch (err) {
        const elapsed = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        probeResult = {
          name: pc.name, description: pc.description, url: pc.url,
          phase1_402: null, phase2_payment: null,
          status: "error", responseTimeMs: elapsed, costMicroUsdc: 0,
          error: errorMsg, timestamp: new Date().toISOString(),
        };
        console.log(` ✗ ${elapsed}ms — ${errorMsg.slice(0, 120)}`);
      }

      probeResults.push(probeResult);
    }
  }

  // ─── Summary ───
  console.log("\n=== Summary ===\n");

  if (adapterResults.length > 0) {
    console.log("Adapter tests:");
    const services = [...new Set(adapterResults.map(r => r.service))];
    for (const svc of services) {
      const svcResults = adapterResults.filter(r => r.service === svc);
      const successes = svcResults.filter(r => r.status === "success");
      const avgTime = successes.length > 0
        ? Math.round(successes.reduce((s, r) => s + r.responseTimeMs, 0) / successes.length)
        : 0;
      const cost = svcResults.reduce((s, r) => s + r.costMicroUsdc, 0);
      const status = successes.length === 0 ? "FAIL"
        : !successes.some(r => r.hasData) ? "EMPTY" : "OK";
      const icon = status === "OK" ? "✓" : status === "EMPTY" ? "⚠" : "✗";
      console.log(`  ${icon} ${svc}: ${successes.length}/${svcResults.length} ok, avg ${avgTime}ms, $${(cost / 1_000_000).toFixed(4)} [${status}]`);
    }
  }

  if (probeResults.length > 0) {
    console.log("\nProbe tests:");
    for (const pr of probeResults) {
      const icon = pr.status === "x402-payment-ok" ? "✓"
        : pr.status === "x402-verified" ? "◎"
        : pr.status === "x402-payment-failed" ? "⚠"
        : "✗";
      const costLabel = pr.costMicroUsdc > 0 ? `$${(pr.costMicroUsdc / 1_000_000).toFixed(4)}` : "free";
      const extra = pr.phase2_payment?.dataKeys?.length
        ? `${pr.phase2_payment.dataKeys.length} keys`
        : pr.error?.slice(0, 80) ?? "";
      console.log(`  ${icon} ${pr.name}: ${pr.status}, ${pr.responseTimeMs}ms, ${costLabel} — ${extra}`);
    }
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
    totalAdapterCases: adapterResults.length,
    totalProbeCases: probeResults.length,
    adapterResults,
    probeResults,
  }, null, 2));

  console.log(`\nResults saved to: ${outPath}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
