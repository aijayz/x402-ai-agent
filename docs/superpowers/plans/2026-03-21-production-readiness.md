# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the x402 AI Agent production-ready with real x402 service adapters, clean tool UI, rate limiting, a landing page, and staging/production environment split.

**Architecture:** Environment-keyed service registry where `NETWORK` env var selects real adapters (mainnet) or stubs (testnet). Cluster tools call `getService()` instead of direct HTTP. Landing page at `/`, chat moves to `/chat`. Upstash Redis rate limiting in middleware.

**Tech Stack:** Next.js App Router, TypeScript, AI SDK v6, Upstash Redis, x402/client, viem, shadcn/ui, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-21-production-readiness-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/services/types.ts` | `X402ServiceAdapter`, `X402ServiceResponse`, `PaymentContext` interfaces |
| `src/lib/services/registry.ts` | `getService(name)` — resolves to real or stub adapter based on `env.NETWORK` |
| `src/lib/services/payment-handler.ts` | `callWithPayment()` — typed wrapper around `x402Fetch` for service adapters |
| `src/lib/services/index.ts` | Re-exports `getService`, `callWithPayment` |
| `src/lib/services/adapters/rug-munch.ts` | Real adapter for Rug Munch DeFi safety API |
| `src/lib/services/adapters/diamond-claws.ts` | Real adapter for DiamondClaws token metrics API |
| `src/lib/services/adapters/wallet-iq.ts` | Real adapter for WalletIQ wallet profiling API |
| `src/lib/services/adapters/genvox.ts` | Real adapter for GenVox social sentiment API |
| `src/lib/services/adapters/augur.ts` | Real adapter for Augur prediction markets API |
| `src/lib/services/adapters/stubs/rug-munch.stub.ts` | Deterministic mock data for Rug Munch |
| `src/lib/services/adapters/stubs/diamond-claws.stub.ts` | Deterministic mock data for DiamondClaws |
| `src/lib/services/adapters/stubs/wallet-iq.stub.ts` | Deterministic mock data for WalletIQ |
| `src/lib/services/adapters/stubs/genvox.stub.ts` | Deterministic mock data for GenVox |
| `src/lib/services/adapters/stubs/augur.stub.ts` | Deterministic mock data for Augur |
| `src/lib/tool-display-config.ts` | Tool ID → `{ label, icon }` mapping for UI |
| `src/lib/rate-limit.ts` | Upstash ratelimit wrapper with tier/route config |
| `src/app/chat/page.tsx` | Chat page (moved from `src/app/page.tsx`) |
| `src/app/chat/layout.tsx` | Chat-specific layout: wallet providers, header, credit badge |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/env.ts` | Add `GENVOX_URL`, Upstash vars; remove `STAKEVIA_URL`, `MYCELIA_URL`, `EINSTEIN_AI_URL`, `SLAMAI_URL`, `NEYNAR_URL`, `FIRECRAWL_URL` |
| `src/lib/clusters/types.ts` | Update `MARKUP_BPS` (remove stakevia/blockrun, add new services) |
| `src/lib/clusters/cluster-a-defi.ts` | Refactor to use service layer |
| `src/lib/clusters/cluster-b-whale.ts` | Refactor to use service layer (WalletIQ + DiamondClaws) |
| `src/lib/clusters/cluster-d-social.ts` | Refactor to use service layer (GenVox + Augur) |
| `src/lib/clusters/cluster-f-solana.ts` | Rename tool to `analyze_market_trends`, use GenVox + DiamondClaws |
| `src/lib/agents/orchestrator.ts` | Update tool names/descriptions in system prompt |
| `src/app/page.tsx` | Replace with landing page |
| `src/app/layout.tsx` | Slim down: remove header, wallet providers, credit badge |
| `src/middleware.ts` | Add Upstash rate limiting |
| `src/components/ai-elements/tool.tsx` | Tool UI cleanup: hide raw JSON, use display config |

---

### Task 1: Service Layer Types and Payment Handler

**Files:**
- Create: `src/lib/services/types.ts`
- Create: `src/lib/services/payment-handler.ts`
- Create: `src/lib/services/index.ts`

**Prerequisites:** Verify that `src/lib/x402-client.ts` exists and exports `x402Fetch`. Run: `grep "export.*function x402Fetch\|export.*x402Fetch" src/lib/x402-client.ts` — must show the export. If not found, check for the actual export name and adjust the import in `payment-handler.ts`.

- [ ] **Step 1: Create `src/lib/services/types.ts`**

```typescript
import type { WalletClient } from "viem";

export interface PaymentContext {
  walletClient: WalletClient;
  userWallet: string | null;
}

export interface X402ServiceResponse<T = unknown> {
  data: T;
  cost: number; // micro-USDC
  source: string;
  cached?: boolean;
}

export interface X402ServiceAdapter<TInput = unknown, TOutput = unknown> {
  name: string;
  estimatedCostMicroUsdc: number;
  call(input: TInput, ctx: PaymentContext): Promise<X402ServiceResponse<TOutput>>;
}
```

- [ ] **Step 2: Create `src/lib/services/payment-handler.ts`**

Wraps `x402Fetch` from `src/lib/x402-client.ts` into a typed helper for service adapters:

```typescript
import { x402Fetch } from "../x402-client";
import type { PaymentContext } from "./types";

interface CallOptions {
  maxPaymentMicroUsdc: number;
  timeoutMs?: number;
}

export async function callWithPayment<T = unknown>(
  url: string,
  init: RequestInit | undefined,
  ctx: PaymentContext,
  options: CallOptions,
): Promise<{ data: T; costMicroUsdc: number; paid: boolean }> {
  const result = await x402Fetch(url, init, {
    walletClient: ctx.walletClient,
    maxPaymentMicroUsdc: options.maxPaymentMicroUsdc,
    timeoutMs: options.timeoutMs,
  });
  return {
    data: result.data as T,
    costMicroUsdc: result.amountMicroUsdc,
    paid: result.paid,
  };
}
```

- [ ] **Step 3: Create `src/lib/services/index.ts`**

```typescript
export { callWithPayment } from "./payment-handler";
export type { PaymentContext, X402ServiceAdapter, X402ServiceResponse } from "./types";
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/
git commit -m "feat: add service layer types and payment handler"
```

---

### Task 2: Stub Infrastructure and First Stub (Rug Munch)

**Files:**
- Create: `src/lib/services/adapters/stubs/rug-munch.stub.ts`

- [ ] **Step 1: Create `src/lib/services/adapters/stubs/rug-munch.stub.ts`**

Stubs use a deterministic hash of the input to select from a pool of responses:

```typescript
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../../types";

/** Simple string hash → index for deterministic mock selection */
function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface RugMunchInput { target: string; depth?: "quick" | "full" }
interface RugMunchOutput {
  riskScore: number;
  riskLevel: string;
  flags: string[];
  contractVerified: boolean;
  liquidityLocked: boolean;
  holderConcentration: number;
}

const MOCK_POOL: RugMunchOutput[] = [
  {
    riskScore: 15, riskLevel: "low", flags: [],
    contractVerified: true, liquidityLocked: true, holderConcentration: 0.12,
  },
  {
    riskScore: 45, riskLevel: "medium", flags: ["high-owner-balance", "no-audit"],
    contractVerified: true, liquidityLocked: false, holderConcentration: 0.35,
  },
  {
    riskScore: 82, riskLevel: "high", flags: ["honeypot-risk", "proxy-contract", "concentrated-holders"],
    contractVerified: false, liquidityLocked: false, holderConcentration: 0.68,
  },
  {
    riskScore: 55, riskLevel: "medium", flags: ["mint-function", "no-renounce"],
    contractVerified: true, liquidityLocked: true, holderConcentration: 0.22,
  },
];

export const rugMunchStub: X402ServiceAdapter<RugMunchInput, RugMunchOutput> = {
  name: "RugMunch",
  estimatedCostMicroUsdc: 50_000,
  async call(input: RugMunchInput): Promise<X402ServiceResponse<RugMunchOutput>> {
    const idx = hashToIndex(input.target, MOCK_POOL.length);
    return { data: MOCK_POOL[idx], cost: 50_000, source: "RugMunch (stub)" };
  },
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/adapters/stubs/rug-munch.stub.ts
git commit -m "feat: add rug munch stub adapter with deterministic mock data"
```

---

### Task 3: Remaining Stub Adapters

**Files:**
- Create: `src/lib/services/adapters/stubs/diamond-claws.stub.ts`
- Create: `src/lib/services/adapters/stubs/wallet-iq.stub.ts`
- Create: `src/lib/services/adapters/stubs/genvox.stub.ts`
- Create: `src/lib/services/adapters/stubs/augur.stub.ts`

- [ ] **Step 1: Create DiamondClaws stub**

Follow the same pattern as rug-munch stub (use `hashToIndex`, pool of 4 entries, same `X402ServiceAdapter` interface). Output shape and anchor entry:
```typescript
interface DiamondClawsOutput {
  tokenSymbol: string;
  holderCount: number;
  top10HolderPercent: number;
  diamondHandsScore: number; // 0-100
  avgHoldDays: number;
  recentLargeTransfers: number;
}

// Anchor entry (first pool item):
{ tokenSymbol: "UNI", holderCount: 342_100, top10HolderPercent: 0.28, diamondHandsScore: 72, avgHoldDays: 145, recentLargeTransfers: 3 }
```
Add 3 more varied entries (different symbols, holder counts, scores). `estimatedCostMicroUsdc: 1_000`. Source: `"DiamondClaws (stub)"`.

- [ ] **Step 2: Create WalletIQ stub**

Output shape and anchor entry:
```typescript
interface WalletIQOutput {
  walletType: "whale" | "fund" | "mev-bot" | "retail" | "unknown";
  totalValueUsd: number;
  activeChains: string[];
  topHoldings: Array<{ symbol: string; valueUsd: number }>;
  recentActivity: string;
  riskScore: number;
}

// Anchor entry:
{ walletType: "whale", totalValueUsd: 4_200_000, activeChains: ["ethereum", "base", "arbitrum"], topHoldings: [{ symbol: "ETH", valueUsd: 2_100_000 }, { symbol: "USDC", valueUsd: 1_500_000 }], recentActivity: "Sold 500 ETH in last 24h", riskScore: 25 }
```
Add 3 more varied entries (different wallet types, holdings). `estimatedCostMicroUsdc: 5_000`. Source: `"WalletIQ (stub)"`.

- [ ] **Step 3: Create GenVox stub**

Output shape and anchor entry:
```typescript
interface GenVoxOutput {
  sentimentScore: number; // -100 to 100
  sentimentLabel: string;
  trendingNarratives: string[];
  topMentions: Array<{ source: string; text: string }>;
  volumeChange24h: number;
}

// Anchor entry:
{ sentimentScore: 65, sentimentLabel: "bullish", trendingNarratives: ["Base ecosystem growth", "L2 summer narrative"], topMentions: [{ source: "twitter", text: "Base TVL just hit $10B" }, { source: "farcaster", text: "Onchain summer 2.0 incoming" }], volumeChange24h: 42.5 }
```
Add 3 more varied entries (bearish, neutral, mixed). `estimatedCostMicroUsdc: 30_000`. Source: `"GenVox (stub)"`.

- [ ] **Step 4: Create Augur stub**

Output shape and anchor entry:
```typescript
interface AugurOutput {
  predictionMarkets: Array<{
    question: string;
    yesPrice: number;
    volume24h: number;
    resolution: string;
  }>;
  overallSentiment: string;
  confidence: number;
}

// Anchor entry:
{ predictionMarkets: [{ question: "Will ETH exceed $5000 by Q2 2026?", yesPrice: 0.62, volume24h: 85000, resolution: "unresolved" }, { question: "Will Base TVL exceed $15B by end of month?", yesPrice: 0.45, volume24h: 32000, resolution: "unresolved" }], overallSentiment: "cautiously optimistic", confidence: 0.71 }
```
Add 3 more varied entries. `estimatedCostMicroUsdc: 100_000`. Source: `"Augur (stub)"`.


- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/adapters/stubs/
git commit -m "feat: add stub adapters for diamond-claws, wallet-iq, genvox, augur"
```

---

### Task 4: Real Adapters

**Files:**
- Create: `src/lib/services/adapters/rug-munch.ts`
- Create: `src/lib/services/adapters/diamond-claws.ts`
- Create: `src/lib/services/adapters/wallet-iq.ts`
- Create: `src/lib/services/adapters/genvox.ts`
- Create: `src/lib/services/adapters/augur.ts`

Each real adapter follows the same pattern — use `callWithPayment` and the service URL from `env.*`:

- [ ] **Step 1: Create all 5 real adapters**

Template (using rug-munch as example):
```typescript
import { env } from "../../env";
import { callWithPayment } from "../payment-handler";
import type { X402ServiceAdapter, X402ServiceResponse, PaymentContext } from "../types";

interface RugMunchInput { target: string; depth?: "quick" | "full" }

export const rugMunchAdapter: X402ServiceAdapter<RugMunchInput, unknown> = {
  name: "RugMunch",
  estimatedCostMicroUsdc: 50_000,
  async call(input: RugMunchInput, ctx: PaymentContext): Promise<X402ServiceResponse> {
    const url = env.RUGMUNCH_URL;
    if (!url) throw new Error("RUGMUNCH_URL not configured");
    const result = await callWithPayment(
      `${url}/scan?target=${encodeURIComponent(input.target)}`,
      undefined, ctx,
      { maxPaymentMicroUsdc: 2_000_000 },
    );
    return { data: result.data, cost: result.costMicroUsdc, source: "RugMunch" };
  },
};
```

Repeat for each service, adjusting URL, endpoint, and `maxPaymentMicroUsdc` (set to ~2x the spec estimated cost as a safety buffer):

| Adapter | env var | Endpoint | `estimatedCostMicroUsdc` | `maxPaymentMicroUsdc` |
|---------|---------|----------|--------------------------|----------------------|
| `rug-munch.ts` | `env.RUGMUNCH_URL` | `/scan?target=...` | 50_000 | 2_000_000 (higher buffer — rug-munch has variable pricing $0.02-$2.00) |
| `diamond-claws.ts` | `env.DIAMONDCLAWS_URL` | `/score?target=...` | 1_000 | 2_000 |
| `wallet-iq.ts` | `env.WALLETIQ_URL` | `/profile?address=...` | 5_000 | 10_000 |
| `genvox.ts` | `env.GENVOX_URL` | `/sentiment?topic=...` | 30_000 | 60_000 |
| `augur.ts` | `env.AUGUR_URL` | `/analyze?address=...` | 100_000 | 200_000 |

The `maxPaymentMicroUsdc` is the maximum the wallet will authorize per call — set to 2x the estimated cost to handle price fluctuations while preventing excessive charges.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/adapters/*.ts
git commit -m "feat: add real x402 service adapters for all 5 services"
```

---

### Task 5: Service Registry

**Files:**
- Create: `src/lib/services/registry.ts`
- Modify: `src/lib/services/index.ts`

- [ ] **Step 1: Create `src/lib/services/registry.ts`**

```typescript
import { env } from "../env";
import type { X402ServiceAdapter } from "./types";

// Lazy imports to avoid circular dependencies
const adapters = {
  "rug-munch": {
    real: () => import("./adapters/rug-munch").then(m => m.rugMunchAdapter),
    stub: () => import("./adapters/stubs/rug-munch.stub").then(m => m.rugMunchStub),
  },
  "diamond-claws": {
    real: () => import("./adapters/diamond-claws").then(m => m.diamondClawsAdapter),
    stub: () => import("./adapters/stubs/diamond-claws.stub").then(m => m.diamondClawsStub),
  },
  "wallet-iq": {
    real: () => import("./adapters/wallet-iq").then(m => m.walletIQAdapter),
    stub: () => import("./adapters/stubs/wallet-iq.stub").then(m => m.walletIQStub),
  },
  "genvox": {
    real: () => import("./adapters/genvox").then(m => m.genvoxAdapter),
    stub: () => import("./adapters/stubs/genvox.stub").then(m => m.genvoxStub),
  },
  "augur": {
    real: () => import("./adapters/augur").then(m => m.augurAdapter),
    stub: () => import("./adapters/stubs/augur.stub").then(m => m.augurStub),
  },
} as const;

export type ServiceName = keyof typeof adapters;

const cache = new Map<string, X402ServiceAdapter>();

export async function getService(name: ServiceName): Promise<X402ServiceAdapter> {
  const key = `${name}-${env.NETWORK}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const entry = adapters[name];
  const isMainnet = env.NETWORK === "base";
  const adapter = await (isMainnet ? entry.real() : entry.stub());
  cache.set(key, adapter);
  return adapter;
}
```

- [ ] **Step 2: Update `src/lib/services/index.ts`**

Add re-export:
```typescript
export { getService } from "./registry";
export type { ServiceName } from "./registry";
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/registry.ts src/lib/services/index.ts
git commit -m "feat: add service registry with env-based real/stub resolution"
```

---

### Task 6: Update env.ts and Refactor Cluster Files to Use Service Layer

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/lib/clusters/cluster-a-defi.ts`
- Modify: `src/lib/clusters/cluster-b-whale.ts`
- Modify: `src/lib/clusters/cluster-d-social.ts`
- Modify: `src/lib/clusters/cluster-f-solana.ts`
- Modify: `src/lib/clusters/types.ts`

**Important:** env.ts changes and cluster refactors must be committed together. Removing env vars before updating cluster files would leave the codebase in a broken state. Do both in one task.

All 4 cluster files follow the same refactoring pattern: replace direct `x402Fetch` + `env.SERVICE_URL` calls with `getService(name)` → `adapter.call(input, ctx)`.

- [ ] **Step 1: Update `src/lib/env.ts`**

Changes:
1. Add `GENVOX_URL: z.string().url().optional()` to server section
2. Add `UPSTASH_REDIS_REST_URL: z.string().url().optional()` and `UPSTASH_REDIS_REST_TOKEN: z.string().optional()` to server section (with comment: `// Validated here for documentation; middleware reads process.env directly due to Edge runtime constraints`)
3. Remove: `EINSTEIN_AI_URL`, `SLAMAI_URL`, `MYCELIA_URL`, `TWITSH_URL`, `NEYNAR_URL`, `FIRECRAWL_URL`, `STAKEVIA_URL`
4. Update `runtimeEnv` to match (add new, remove old)
5. Keep: `RUGMUNCH_URL`, `AUGUR_URL`, `DIAMONDCLAWS_URL`, `WALLETIQ_URL` (already exist)

- [ ] **Step 2: Update `src/lib/clusters/types.ts`**

Update `MARKUP_BPS` — remove `stakevia` and `blockrun`, keep `default`:
```typescript
export const MARKUP_BPS: Record<string, number> = {
  default: 3000, // 30%
};
```

- [ ] **Step 3: Refactor `cluster-a-defi.ts`**

Replace the 3 service blocks (RugMunch, Augur, DiamondClaws) with:
```typescript
import { getService } from "../services";
import type { PaymentContext } from "../services/types";
// Remove: import { x402Fetch } from "../x402-client";
// Remove: import { env } from "../env";
```

Inside `execute`:
```typescript
const ctx: PaymentContext = { walletClient: deps.walletClient, userWallet: deps.userWallet };

// Call services via registry
const serviceNames = depth === "full"
  ? ["rug-munch", "augur", "diamond-claws"] as const
  : ["rug-munch", "augur"] as const;

for (const name of serviceNames) {
  try {
    const adapter = await getService(name);
    const result = await adapter.call({ target }, ctx);
    calls.push({
      serviceName: adapter.name,
      data: result.data,
      costMicroUsdc: result.cost,
      paid: result.cost > 0,
    });
  } catch (err) {
    errors.push(`${name}: ${err instanceof Error ? err.message : "unavailable"}`);
  }
}
```

Remove the `unavailable` array logic — stubs always return data, so services are never "unavailable" in the old sense. On mainnet, if a URL is missing, the real adapter throws and it's caught above.

Keep the credit reservation/release pattern (reserve before, release unused after).

- [ ] **Step 4: Refactor `cluster-b-whale.ts`**

Same pattern. Services: `["wallet-iq", "diamond-claws"]`. Remove references to `EINSTEIN_AI_URL`, `SLAMAI_URL`, `MYCELIA_URL`.

- [ ] **Step 5: Refactor `cluster-d-social.ts`**

Same pattern. Services: `["genvox", "augur"]`. Remove references to `TWITSH_URL`, `NEYNAR_URL`, `FIRECRAWL_URL`.

- [ ] **Step 6: Refactor `cluster-f-solana.ts`**

Rename tool from `analyze_solana_staking` to `analyze_market_trends`. Update description. Services: `["genvox", "diamond-claws"]`. Remove references to `STAKEVIA_URL`, `MYCELIA_URL`.

Update tool description:
```typescript
description:
  "Analyze market trends — trending narratives, emerging tokens, and market intelligence. " +
  "Calls GenVox and DiamondClaws x402 services. " +
  "Costs ~$0.03.",
```

Update input schema: rename `query` field description to reflect market trends rather than staking.

Also update the cluster summary to surface errors to the user per the spec. When a service call fails, include the error in the summary string:
```typescript
const failedNames = errors.map(e => e.split(":")[0]);
const successNames = calls.map(c => c.serviceName);

const summary = successNames.length > 0
  ? `Analyzed using ${successNames.join(", ")}.` +
    (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
  : `Analysis unavailable — all services failed to respond.`;
```

- [ ] **Step 7: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — all removed env var references should be gone

- [ ] **Step 8: Commit**

```bash
git add src/lib/env.ts src/lib/clusters/
git commit -m "feat: update env vars and refactor all 4 cluster tools to use service registry"
```

---

### Task 7: Update Orchestrator System Prompt

**Files:**
- Modify: `src/lib/agents/orchestrator.ts`

- [ ] **Step 1: Update system prompt in orchestrator.ts**

In `createOrchestrator`, update the instructions string:

1. Replace `analyze_solana_staking (~$1.25)` with `analyze_market_trends (~$0.03)` and update description
2. Update cluster tool cost descriptions:
   - `analyze_defi_safety ($0.12-$2.10)` — rug pull detection, contract auditing, token metrics
   - `track_whale_activity (~$0.01)` — wallet profiling, smart money tracking
   - `analyze_social_narrative (~$0.13)` — Twitter/Farcaster sentiment, prediction markets
   - `analyze_market_trends (~$0.03)` — trending narratives, emerging tokens

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/orchestrator.ts
git commit -m "feat: update orchestrator system prompt with new tool names and costs"
```

---

### Task 8: Tool Display Config

**Files:**
- Create: `src/lib/tool-display-config.ts`

- [ ] **Step 1: Create tool display config**

```typescript
export interface ToolDisplayInfo {
  label: string;
  icon: string; // Lucide icon name
}

export const TOOL_DISPLAY: Record<string, ToolDisplayInfo> = {
  // Cluster tools
  analyze_defi_safety: { label: "DeFi Safety Analysis", icon: "Shield" },
  track_whale_activity: { label: "Whale Tracker", icon: "Fish" },
  analyze_social_narrative: { label: "Social Sentiment", icon: "MessageCircle" },
  analyze_market_trends: { label: "Market Intelligence", icon: "TrendingUp" },

  // MCP paid tools
  get_crypto_price: { label: "Crypto Price", icon: "DollarSign" },
  get_wallet_profile: { label: "Wallet Profile", icon: "Wallet" },
  summarize_url: { label: "URL Summary", icon: "Globe" },
  analyze_contract: { label: "Contract Analysis", icon: "FileCode" },
  generate_image: { label: "Image Generation", icon: "Image" },

  // Free tools
  add: { label: "Calculator", icon: "Calculator" },
  get_random_number: { label: "Random Number", icon: "Dice1" },
  check_budget: { label: "Budget Check", icon: "CreditCard" },
  search_x402_services: { label: "Service Search", icon: "Search" },
  probe_x402_service: { label: "Service Probe", icon: "Radar" },
  list_registered_services: { label: "Service List", icon: "List" },
};

export function getToolDisplay(toolName: string): ToolDisplayInfo {
  return TOOL_DISPLAY[toolName] ?? { label: toolName.replace(/_/g, " "), icon: "Wrench" };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/tool-display-config.ts
git commit -m "feat: add tool display config for human-friendly names and icons"
```

---

### Task 9: Tool UI Cleanup

**Files:**
- Modify: `src/components/ai-elements/tool.tsx`

This is the largest single-file change. The goal: no raw JSON shown to users by default, all tools show human-friendly names and clean results.

- [ ] **Step 1: Import tool display config**

At the top of `tool.tsx`, add:
```typescript
import { getToolDisplay } from "@/lib/tool-display-config";
```

- [ ] **Step 2: Update `ToolHeader` to use display config**

Replace hardcoded tool name rendering with `getToolDisplay(toolName)`:
- Use `displayInfo.label` instead of raw `toolName`
- Show "Analyzing DeFi Safety..." during loading instead of "analyze_defi_safety"

- [ ] **Step 3: Update default fallback in `ToolOutput`**

The current fallback renders `JSON.stringify(output)`. Replace with:

```typescript
// Default: show simple status label, hide raw JSON
<div className="text-sm text-muted-foreground">
  {part.status === "running" ? "Processing..." : "Completed"}
</div>
```

- [ ] **Step 4: Add collapsible raw data toggle**

At the bottom of every tool output, add a collapsed "Show raw data" section:

```typescript
{output && (
  <details className="mt-2">
    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
      Show raw data
    </summary>
    <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40">
      {JSON.stringify(output, null, 2)}
    </pre>
  </details>
)}
```

- [ ] **Step 5: Expand `renderToolSpecificOutput` for cluster tools**

Add renderers for all 4 cluster tools. Pattern for `analyze_defi_safety`:

```typescript
if (toolName === "analyze_defi_safety" && output?.serviceCalls?.length) {
  return (
    <div className="space-y-2">
      {output.serviceCalls.map((call: any, i: number) => (
        <div key={i} className="text-sm">
          <span className="font-medium">{call.serviceName}</span>
          {call.data?.riskScore != null && (
            <span className="ml-2 text-muted-foreground">
              Risk: {call.data.riskScore}/100
            </span>
          )}
        </div>
      ))}
      {output.summary && (
        <p className="text-sm text-muted-foreground">{output.summary}</p>
      )}
    </div>
  );
}
```

Similar for `track_whale_activity`, `analyze_social_narrative`, `analyze_market_trends` — extract the key data points and render concisely.

- [ ] **Step 6: Simplify payment badge**

In the payment section, simplify from full transaction details to just:
```
"$0.12 paid" (collapsed: full details)
```

- [ ] **Step 7: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 8: Commit**

```bash
git add src/components/ai-elements/tool.tsx
git commit -m "feat: clean up tool UI — hide raw JSON, show human-friendly names and results"
```

---

### Task 10: Rate Limiting

**Files:**
- Create: `src/lib/rate-limit.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Install Upstash packages**

```bash
pnpm add @upstash/ratelimit @upstash/redis
```

- [ ] **Step 2: Create `src/lib/rate-limit.ts`**

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

interface RateLimitConfig {
  requests: number;
  window: string; // e.g. "1m", "60s"
}

const LIMITS: Record<string, { anon: RateLimitConfig; auth: RateLimitConfig }> = {
  "/api/chat": { anon: { requests: 5, window: "1m" }, auth: { requests: 20, window: "1m" } },
  "/mcp": { anon: { requests: 10, window: "1m" }, auth: { requests: 40, window: "1m" } },
  default: { anon: { requests: 30, window: "1m" }, auth: { requests: 30, window: "1m" } },
};

function getRouteKey(pathname: string): string {
  if (pathname.startsWith("/api/chat")) return "/api/chat";
  if (pathname.startsWith("/mcp")) return "/mcp";
  return "default";
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(routeKey: string, tier: "anon" | "auth"): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const cacheKey = `${routeKey}-${tier}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const config = LIMITS[routeKey]?.[tier] ?? LIMITS.default[tier];
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    prefix: `rl:${routeKey}:${tier}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

export async function checkRateLimit(
  pathname: string,
  ip: string,
  walletAddress?: string | null,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const routeKey = getRouteKey(pathname);
  const tier = walletAddress ? "auth" : "anon";
  const key = walletAddress ?? ip;

  const limiter = getLimiter(routeKey, tier);
  if (!limiter) return { allowed: true }; // No Redis = no rate limiting

  const result = await limiter.limit(key);
  if (result.success) return { allowed: true };

  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
}
```

- [ ] **Step 3: Update `src/middleware.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip rate limiting for static assets and internal routes
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.ip
    ?? "unknown";
  const walletAddress = request.headers.get("x-wallet-address") || null;

  const { allowed, retryAfter } = await checkRateLimit(pathname, ip, walletAddress);

  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter ?? 30) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icon.svg).*)",
  ],
};
```

Note: We read `process.env` directly in `rate-limit.ts` (not `env.*`) because middleware runs in Edge-compatible context and `@t3-oss/env-nextjs` server vars aren't available there. The env.ts definition is still added for documentation and validation in server context.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/middleware.ts
git commit -m "feat: add Upstash Redis rate limiting in middleware"
```

---

### Task 11: Route Restructure, Landing Page, and 429 Handling

**Important:** Route restructure, landing page, and 429 handling are done together to avoid committing a broken `/` route (404). All three changes land in one commit.

**Files:**
- Create: `src/app/chat/page.tsx`
- Create: `src/app/chat/layout.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx` (replace with landing page)

- [ ] **Step 1: Create `src/app/chat/layout.tsx`**

Move the header, `ClientProviders`, and wallet-related UI from the current root `layout.tsx`:

```tsx
import { ClientProviders } from "@/components/client-providers";
import { WalletPill, CreditBadge } from "@/components/wallet-pill";
import Link from "next/link";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProviders>
      <div className="size-full flex flex-col">
        <header className="relative overflow-hidden border-b border-border bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-background dark:to-gray-900">
          {/* Same header content as current layout.tsx but with Link href="/" */}
          {/* ... copy the full header from current layout.tsx ... */}
          {/* Change the logo Link href from GitHub to "/" */}
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ClientProviders>
  );
}
```

Key change: Logo `<Link>` href changes from the GitHub URL to `"/"`.

- [ ] **Step 2: Create `src/app/chat/page.tsx`**

Move the entire content of current `src/app/page.tsx` to `src/app/chat/page.tsx`. No code changes needed — just the file move.

- [ ] **Step 3: Slim down `src/app/layout.tsx`**

Strip it to the bare essentials:

```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "x402 AI Agent",
  description: "AI agent with x402 crypto payment capabilities",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark">
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased h-full`}>
        {children}
      </body>
    </html>
  );
}
```

No `ClientProviders`, no header, no wallet pill. Those live in `src/app/chat/layout.tsx` now.

- [ ] **Step 4: Create landing page at `src/app/page.tsx`**

A server component (no `"use client"`) with 4 sections: hero, features, pricing, footer.

```tsx
import Link from "next/link";
import { Shield, Fish, MessageCircle, TrendingUp, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Shield, title: "DeFi Safety Analysis",
    description: "Rug pull detection, contract auditing, and token risk scoring",
    cost: "from $0.12",
  },
  {
    icon: Fish, title: "Whale Tracking",
    description: "Smart money movements and wallet profiling",
    cost: "from $0.01",
  },
  {
    icon: MessageCircle, title: "Social Sentiment",
    description: "Twitter and Farcaster narrative analysis",
    cost: "from $0.13",
  },
  {
    icon: TrendingUp, title: "Market Intelligence",
    description: "Trending narratives and emerging token discovery",
    cost: "from $0.03",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 p-[1.5px]">
              <div className="w-full h-full rounded-[6px] bg-background flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <span className="text-sm font-bold text-foreground">x402</span>
          </div>
          <Button asChild size="sm">
            <Link href="/chat">
              Launch App <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            AI agent that pays for intelligence
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Ask anything about crypto. The agent orchestrates paid research services,
            handles USDC payments on Base automatically, and synthesizes answers from
            multiple sources.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="/chat">
                Start chatting <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer">
                Learn about x402
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
            Research clusters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-lg border border-border p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <f.icon className="size-5 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">{f.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{f.description}</p>
                <p className="text-xs text-muted-foreground/70">{f.cost}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
            Simple pricing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-6 space-y-3">
              <h3 className="font-semibold text-foreground">Free</h3>
              <p className="text-sm text-muted-foreground">
                2 free tool calls. Prices, summaries, images, and basic analysis.
              </p>
              <p className="text-2xl font-bold text-foreground">$0</p>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6 space-y-3">
              <h3 className="font-semibold text-foreground">Credits</h3>
              <p className="text-sm text-muted-foreground">
                Connect wallet, deposit USDC. Access all research clusters and premium tools.
              </p>
              <p className="text-2xl font-bold text-foreground">Pay as you go</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>Built with the x402 protocol on Base</span>
          <div className="flex items-center gap-4">
            <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">x402.org</a>
            <a href="https://github.com/aijayz/x402-ai-agent" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
            <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Base</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 5: Add 429 handling to `src/app/chat/page.tsx`**

In the `useChat` `onError` callback, detect rate limit errors and show a friendly message:

```typescript
const { messages, sendMessage, setMessages, status } = useChat({
  onError: (error) => {
    if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
      setLastError(new Error("RATE_LIMITED"));
    } else {
      setLastError(error);
    }
  },
});
```

Note: `lastError` state already exists in the chat page from the original `page.tsx` — `const [lastError, setLastError] = useState<Error | null>(null)`.

In the error display JSX, add a rate limit case before the generic error (before the `FREE_CALLS_EXHAUSTED` check):

```tsx
{status === "error" && lastError?.message === "RATE_LIMITED" && (
  <div className="flex flex-col items-center justify-center p-6 mx-auto max-w-md">
    <div className="flex flex-col items-center gap-4 p-6 bg-amber-950/50 border border-amber-800/50 rounded-lg text-center">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-amber-200">Too many requests</h3>
        <p className="text-sm text-amber-300">
          You&apos;re sending messages too quickly. Please wait a moment and try again.
        </p>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: Build succeeds. Both `/` (landing) and `/chat` (chat app) routes exist.

- [ ] **Step 7: Commit**

```bash
git add src/app/chat/ src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add landing page, move chat to /chat, handle 429 rate limiting"
```

---

### Task 12: Final Verification and Build

- [ ] **Step 1: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS with no errors

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds for both `/` (landing) and `/chat` (chat app)

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`

Verify:
1. `/` shows landing page with hero, features, pricing, footer
2. "Launch App" button navigates to `/chat`
3. `/chat` shows the chat interface with header (wallet pill, credit badge)
4. Logo in chat header links back to `/`
5. Sending a message works (AI responds)
6. Cluster tools return stub data (on base-sepolia) — verify by expanding "Show raw data" on a cluster tool card and checking `source` field ends with `(stub)`
7. Tool cards show human-friendly names, no raw JSON
8. Tool cards have "Show raw data" collapsed toggle

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address smoke test issues"
```
