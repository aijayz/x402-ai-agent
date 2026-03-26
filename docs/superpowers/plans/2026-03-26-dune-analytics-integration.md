# Dune Analytics Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dune Analytics temporal on-chain data (whale flows, CEX flows, DEX volume, etc.) to the Obol AI agent via REST API with Redis caching.

**Architecture:** A Dune REST client with Upstash Redis cache layer provides 14 parameterized query templates. Clusters B/C/A/E/F call Dune internally for enriched results. A standalone `query_onchain_data` tool handles ad-hoc queries. All Dune calls are non-blocking — clusters degrade gracefully if Dune is unavailable.

**Tech Stack:** Dune REST API, Upstash Redis (`@upstash/redis`), AI SDK `tool()`, Zod schemas, existing cluster/telemetry patterns.

**Prerequisite:** Before deploying with real data, create and validate all 14 Dune SQL queries in the Dune query editor UI. Record the real query IDs and update `dune-templates.ts`. The code ships first with placeholder IDs (0); queries are filled in as they're validated. See the design spec for the query table list.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/services/dune.ts` | **New** — Dune REST client (fast-path + execute/poll) and Redis cache layer |
| `src/lib/services/dune-templates.ts` | **New** — 14 query template definitions with IDs, descriptions, and param schemas |
| `src/lib/env.ts` | **Modify** — Add `DUNE_API_KEY` to server env schema |
| `.env.example` | **Modify** — Add `DUNE_API_KEY` placeholder |
| `src/lib/telemetry.ts` | **Modify** — Add `duneQuery` telemetry event |
| `src/lib/tool-prices.ts` | **Modify** — Add `query_onchain_data` pricing |
| `src/lib/tool-display-config.ts` | **Modify** — Add `query_onchain_data` display config |
| `src/lib/clusters/cluster-b-whale.ts` | **Modify** — Add Dune whale flow + CEX flow calls |
| `src/lib/clusters/cluster-c-portfolio.ts` | **Modify** — Add Dune wallet PnL call |
| `src/lib/clusters/cluster-f-market.ts` | **Modify** — Add Dune DEX volume + stablecoin supply calls |
| `src/lib/clusters/cluster-a-defi.ts` | **Modify** — Add Dune liquidation risk + liquidity depth calls |
| `src/lib/clusters/cluster-e-alpha.ts` | **Modify** — Add Dune smart money + velocity calls |
| `src/lib/agents/orchestrator.ts` | **Modify** — Add `query_onchain_data` tool + update system prompt |

---

### Task 1: Environment & Telemetry Setup

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Modify: `src/lib/telemetry.ts`
- Modify: `src/lib/tool-prices.ts`
- Modify: `src/lib/tool-display-config.ts`

- [ ] **Step 1: Add DUNE_API_KEY to env schema**

In `src/lib/env.ts`, add to the `server` object (after `TELEGRAM_CHAT_ID`):

```typescript
    // Dune Analytics (optional — temporal on-chain data)
    DUNE_API_KEY: z.string().optional(),
```

Add to the `runtimeEnv` object:

```typescript
    DUNE_API_KEY: process.env.DUNE_API_KEY,
```

- [ ] **Step 2: Add DUNE_API_KEY to .env.example**

Add this section after the `# Data Provider URLs` section:

```bash
# ===========================================
# Dune Analytics (optional — temporal on-chain data)
# ===========================================
# Get an API key at https://dune.com (APIs and Connectors > API Keys)
# Free tier works for dev. Analyst tier (~$50/mo) recommended for production.
DUNE_API_KEY=
```

- [ ] **Step 3: Add duneQuery telemetry event**

In `src/lib/telemetry.ts`, add after the `clusterComplete` method:

```typescript
  duneQuery(params: {
    template: string;
    cacheHit: boolean;
    durationMs: number;
    rowCount: number | null;
    error?: string;
  }) {
    console.log(JSON.stringify({
      event: "dune_query",
      ...params,
      timestamp: new Date().toISOString(),
    }));
  },
```

- [ ] **Step 4: Add tool pricing and display config**

In `src/lib/tool-prices.ts`, add to `TOOL_PRICES`:

```typescript
  query_onchain_data: 0.05,
```

In `src/lib/tool-display-config.ts`, add to `TOOL_DISPLAY`:

```typescript
  query_onchain_data: { label: "On-Chain Data", icon: "Database" },
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean (zero errors)

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts .env.example src/lib/telemetry.ts src/lib/tool-prices.ts src/lib/tool-display-config.ts
git commit -m "feat(dune): add env var, telemetry, pricing, and display config"
```

---

### Task 2: Dune REST Client + Cache Layer

**Files:**
- Create: `src/lib/services/dune.ts`

- [ ] **Step 1: Create the Dune client with cache**

Create `src/lib/services/dune.ts`:

```typescript
import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import { env } from "@/lib/env";
import { telemetry } from "@/lib/telemetry";

const DUNE_BASE = "https://api.dune.com/api/v1";
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;
const CACHE_TTL_S = 900; // 15 minutes
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// ── Redis singleton (same pattern as rate-limit.ts) ──────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// ── Helpers ───────────────────────────────────────────────────────

function stableStringify(params: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(params).sort()));
}

function cacheKey(template: string, params: Record<string, unknown>): string {
  const hash = createHash("sha256").update(stableStringify(params)).digest("hex").slice(0, 16);
  return `dune:${template}:${hash}`;
}

function duneHeaders(): Record<string, string> {
  return { "X-Dune-API-Key": env.DUNE_API_KEY!, "Content-Type": "application/json" };
}

// ── Dune API calls ───────────────────────────────────────────────

interface DuneResult {
  rows: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

/** Try the fast path: get latest cached result from Dune (no credits consumed). */
async function getLatestResult(queryId: number, params: Record<string, unknown>): Promise<DuneResult | null> {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qp.set(k, String(v));
  }
  const url = `${DUNE_BASE}/query/${queryId}/results?${qp.toString()}`;
  const res = await fetch(url, { headers: duneHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  // Check if the execution is recent enough
  const executedAt = data.execution_ended_at ? new Date(data.execution_ended_at).getTime() : 0;
  if (Date.now() - executedAt > FRESHNESS_THRESHOLD_MS) return null;
  if (!data.result?.rows) return null;
  return { rows: data.result.rows, metadata: data.result.metadata };
}

/** Execute a query and poll for results. Consumes Dune credits. */
async function executeAndPoll(queryId: number, params: Record<string, unknown>): Promise<DuneResult | null> {
  // Execute
  const execRes = await fetch(`${DUNE_BASE}/query/${queryId}/execute`, {
    method: "POST",
    headers: duneHeaders(),
    body: JSON.stringify({ query_parameters: params }),
  });

  if (execRes.status === 402) {
    console.error("[DUNE] Credits exhausted (402)");
    const { sendTelegramAlert } = await import("@/lib/telegram");
    await sendTelegramAlert("*Dune Credits Exhausted*\n\nDune API returned 402. Top up credits or wait for billing reset.").catch(() => {});
    return null;
  }
  if (execRes.status === 401) {
    console.error("[DUNE] Auth failure (401) — check DUNE_API_KEY");
    return null;
  }
  if (!execRes.ok) {
    console.error(`[DUNE] Execute failed: ${execRes.status}`);
    return null;
  }

  const { execution_id } = await execRes.json();

  // Poll
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${DUNE_BASE}/execution/${execution_id}/results`, {
      headers: duneHeaders(),
    });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (pollData.is_execution_finished) {
      if (pollData.state === "QUERY_STATE_COMPLETED" && pollData.result?.rows) {
        return { rows: pollData.result.rows, metadata: pollData.result.metadata };
      }
      // Finished but failed
      console.error("[DUNE] Query execution failed", { execution_id, state: pollData.state });
      return null;
    }
  }

  console.warn("[DUNE] Poll timeout", { execution_id, queryId });
  return null;
}

// ── Public API (with cache) ──────────────────────────────────────

export interface DuneCacheResult {
  rows: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  cacheHit: boolean;
}

/**
 * Get Dune query results with Redis caching.
 * Returns null if DUNE_API_KEY is not set, Dune is unavailable, or the query times out.
 */
export async function queryDune(
  template: string,
  queryId: number,
  params: Record<string, unknown>,
): Promise<DuneCacheResult | null> {
  if (!env.DUNE_API_KEY) {
    console.log("[DUNE] Skipped — no API key");
    return null;
  }

  const key = cacheKey(template, params);
  const start = Date.now();

  // 1. Check Redis cache
  try {
    const r = getRedis();
    if (r) {
      const cached = await r.get<DuneResult>(key);
      if (cached) {
        telemetry.duneQuery({ template, cacheHit: true, durationMs: Date.now() - start, rowCount: cached.rows.length });
        return { ...cached, cacheHit: true };
      }
    }
  } catch (err) {
    console.warn("[DUNE] Redis read error, bypassing cache", err);
  }

  // 2. Try Dune fast path (latest cached result, no credits)
  try {
    const latest = await getLatestResult(queryId, params);
    if (latest) {
      telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: latest.rows.length });
      // Cache in Redis
      try { await getRedis()?.set(key, latest, { ex: CACHE_TTL_S }); } catch {}
      return { ...latest, cacheHit: false };
    }
  } catch (err) {
    console.warn("[DUNE] Fast path failed, falling back to execute", err);
  }

  // 3. Execute + poll (consumes credits)
  try {
    const result = await executeAndPoll(queryId, params);
    if (result) {
      telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: result.rows.length });
      // Cache in Redis
      try { await getRedis()?.set(key, result, { ex: CACHE_TTL_S }); } catch {}
      return { ...result, cacheHit: false };
    }
    telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: null, error: "timeout_or_failure" });
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DUNE] Query failed", { template, error: msg });
    telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: null, error: msg });
    return null;
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean (zero errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/dune.ts
git commit -m "feat(dune): REST client with Redis cache layer"
```

---

### Task 3: Template Registry

**Files:**
- Create: `src/lib/services/dune-templates.ts`

- [ ] **Step 1: Create template registry**

Create `src/lib/services/dune-templates.ts`:

```typescript
export interface DuneTemplate {
  id: string;
  duneQueryId: number;
  description: string;
  params: { name: string; type: "string" | "number"; required: boolean }[];
}

/**
 * Query template registry. duneQueryId values are placeholders (0) until
 * real queries are created and validated in the Dune UI.
 *
 * To add a new template:
 * 1. Write and test the SQL in Dune's query editor
 * 2. Save the query and copy its numeric ID
 * 3. Add an entry here with the real ID
 */
export const DUNE_TEMPLATES: Record<string, DuneTemplate> = {
  // ── Tier 1: Core ──────────────────────────────────────────────

  whale_net_flow_7d: {
    id: "whale_net_flow_7d",
    duneQueryId: 0, // TODO: replace with real Dune query ID
    description: "Net token flow for whale wallets (>$1M) over 7 days — shows accumulation or distribution trend",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  cex_net_flow_7d: {
    id: "cex_net_flow_7d",
    duneQueryId: 0,
    description: "Net token flow into/out of centralized exchanges over 7 days — exchange outflow suggests accumulation",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  top_holder_changes_7d: {
    id: "top_holder_changes_7d",
    duneQueryId: 0,
    description: "Balance changes of top 50 token holders over 7 days",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  dex_volume_7d: {
    id: "dex_volume_7d",
    duneQueryId: 0,
    description: "Daily DEX trading volume for a token over 7 days — shows trading activity trend",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  wallet_pnl_30d: {
    id: "wallet_pnl_30d",
    duneQueryId: 0,
    description: "Realized and unrealized PnL for a wallet over 30 days",
    params: [
      { name: "wallet_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  // ── Tier 2: Differentiating ───────────────────────────────────

  liquidation_risk: {
    id: "liquidation_risk",
    duneQueryId: 0,
    description: "Top borrow positions near liquidation threshold for a token on lending protocols",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  bridge_flow_7d: {
    id: "bridge_flow_7d",
    duneQueryId: 0,
    description: "Net bridge inflows/outflows for a chain over 7 days — shows capital movement between L1s and L2s",
    params: [
      { name: "chain", type: "string", required: true },
    ],
  },

  stablecoin_supply_trend: {
    id: "stablecoin_supply_trend",
    duneQueryId: 0,
    description: "Stablecoin (USDC/USDT) supply trend on a chain over 30 days — growing supply = buying power signal",
    params: [
      { name: "chain", type: "string", required: true },
    ],
  },

  smart_money_moves_7d: {
    id: "smart_money_moves_7d",
    duneQueryId: 0,
    description: "Token transfers by labeled smart money wallets (funds, whales, institutions) over 7 days",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  dex_pair_depth: {
    id: "dex_pair_depth",
    duneQueryId: 0,
    description: "Trade size distribution and estimated slippage for a token — shows real liquidity depth",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  // ── Tier 3: Extended ──────────────────────────────────────────

  flash_loan_activity: {
    id: "flash_loan_activity",
    duneQueryId: 0,
    description: "Flash loan activity involving a token over 7 days — spikes may indicate exploit risk",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  contract_interaction_trend: {
    id: "contract_interaction_trend",
    duneQueryId: 0,
    description: "Daily unique callers and transaction count for a contract over 7 days — shows protocol usage trend",
    params: [
      { name: "contract_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  token_velocity: {
    id: "token_velocity",
    duneQueryId: 0,
    description: "Token transfer frequency and unique sender/receiver count over 7 days — high velocity = speculation, low = utility",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  mev_exposure: {
    id: "mev_exposure",
    duneQueryId: 0,
    description: "Sandwich attack frequency and estimated cost for a token's DEX trades over 7 days",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },
};

/** Get a template by name. Returns undefined if not found. */
export function getTemplate(name: string): DuneTemplate | undefined {
  return DUNE_TEMPLATES[name];
}

/** All template names (for Zod enum in tool schema). */
export const TEMPLATE_NAMES = Object.keys(DUNE_TEMPLATES) as [string, ...string[]];

/** Check if a template has a real Dune query ID (not placeholder 0). */
export function isTemplateReady(template: DuneTemplate): boolean {
  return template.duneQueryId > 0;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/dune-templates.ts
git commit -m "feat(dune): template registry with 14 query definitions"
```

---

### Task 4: Cluster B Integration (Whale Tracking)

**Files:**
- Modify: `src/lib/clusters/cluster-b-whale.ts`

This is the highest-value cluster integration — it directly answers "are whales accumulating?"

- [ ] **Step 1: Add Dune imports to Cluster B**

Read `src/lib/clusters/cluster-b-whale.ts` first. Add these imports at the top (after existing imports):

```typescript
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";
```

- [ ] **Step 2: Replace the `try` block contents inside `execute`**

The current `try` block (lines 46–84) contains: serviceConfigs definition → for loop over services → totalCost calculation → telemetry → summary → return. Replace the **entire contents of the `try` block** (everything between `try {` on line 46 and `} finally {` on line 85) with:

```typescript
          const qsChain = toQSChain(chain as ClusterChain);
          const serviceConfigs = [
            { name: "qs-wallet-risk" as const, input: { address, chain: qsChain } },
            { name: "qs-whale-activity" as const, input: { address, chain: qsChain } },
            { name: "slamai-wallet" as const, input: { address, blockchain: toSLAMaiChain(chain as ClusterChain) } },
          ];

          // Dune temporal data (non-blocking — null on failure)
          const duneTemplates = ["whale_net_flow_7d", "cex_net_flow_7d", "smart_money_moves_7d"] as const;
          const dunePromises = duneTemplates.map((tpl) => {
            const template = getTemplate(tpl);
            if (!template || !isTemplateReady(template)) return Promise.resolve(null);
            return queryDune(tpl, template.duneQueryId, { token_address: address, chain }).catch(() => null);
          });

          // Run x402 services sequentially (existing pattern) + Dune in parallel
          const duneResultsPromise = Promise.all(dunePromises);

          for (const svc of serviceConfigs) {
            const svcStart = Date.now();
            try {
              const adapter = await getService(svc.name);
              const result = await adapter.call(svc.input, ctx);
              const latencyMs = Date.now() - svcStart;
              calls.push({
                serviceName: adapter.name,
                data: result.data,
                costMicroUsdc: result.cost,
                paid: result.cost > 0,
              });
              telemetry.serviceCall({ cluster: "B", service: svc.name, latencyMs, success: true, costMicroUsdc: result.cost });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "unavailable";
              telemetry.serviceCall({ cluster: "B", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
              errors.push(`${svc.name}: ${msg}`);
            }
          }

          // Await Dune results (should already be resolved by now)
          const duneResults = await duneResultsPromise;
          const duneData: Record<string, unknown> = {};
          for (let i = 0; i < duneTemplates.length; i++) {
            if (duneResults[i]?.rows?.length) {
              duneData[duneTemplates[i]] = duneResults[i]!.rows;
            }
          }

          // Include Dune data as a service call result (zero cost — bundled)
          if (Object.keys(duneData).length > 0) {
            calls.push({
              serviceName: "Dune Analytics (temporal)",
              data: duneData,
              costMicroUsdc: 0,
              paid: false,
            });
          }

          const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
          telemetry.clusterComplete({ cluster: "B", tool: "track_whale_activity", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

          const failedNames = errors.map(e => e.split(":")[0]);
          const successNames = calls.map(c => c.serviceName);
          const hasDune = Object.keys(duneData).length > 0;
          const summary = successNames.length > 0
            ? `Tracked whale activity using ${successNames.join(", ")}.` +
              (hasDune ? " Includes 7-day flow trends from Dune Analytics." : "") +
              (failedNames.length > 0 ? ` ${failedNames.join(", ")} temporarily unavailable.` : "")
            : `Whale Intelligence unavailable — all services failed to respond. Errors: ${errors.join("; ")}`;

          return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
```

The `finally` block (lines 85–95) remains **unchanged**.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/clusters/cluster-b-whale.ts
git commit -m "feat(dune): add whale flow + CEX flow + smart money to Cluster B"
```

---

### Task 5: Cluster C Integration (Portfolio)

**Files:**
- Modify: `src/lib/clusters/cluster-c-portfolio.ts`

**Important:** Cluster C's input is a **wallet address**, not a token address. Only `wallet_pnl_30d` (which takes `wallet_address`) is applicable here. `top_holder_changes_7d` requires a `token_address` so it's used only via the standalone tool, not in Cluster C.

- [ ] **Step 1: Add Dune imports to Cluster C**

Read `src/lib/clusters/cluster-c-portfolio.ts` first. Add imports at the top:

```typescript
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";
```

- [ ] **Step 2: Add Dune call for `wallet_pnl_30d`**

Follow the same pattern as Task 4 Step 2. Inside the `try` block, after the `serviceConfigs` definition and before the `for` loop:

```typescript
          // Dune temporal data: wallet PnL (non-blocking)
          const walletPnlTemplate = getTemplate("wallet_pnl_30d");
          const dunePromise = (walletPnlTemplate && isTemplateReady(walletPnlTemplate))
            ? queryDune("wallet_pnl_30d", walletPnlTemplate.duneQueryId, { wallet_address: address, chain }).catch(() => null)
            : Promise.resolve(null);
```

After the service `for` loop (before the `totalCost` calculation), await and add the result:

```typescript
          // Await Dune result
          const duneResult = await dunePromise;
          if (duneResult?.rows?.length) {
            calls.push({
              serviceName: "Dune Analytics (30d PnL)",
              data: { wallet_pnl_30d: duneResult.rows },
              costMicroUsdc: 0,
              paid: false,
            });
          }
```

Update the summary to mention Dune when present (add `hasDune` check like in Task 4).

The `finally` block remains unchanged.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/clusters/cluster-c-portfolio.ts
git commit -m "feat(dune): add wallet PnL to Cluster C"
```

---

### Task 6: Cluster F Integration (Market Trends)

**Files:**
- Modify: `src/lib/clusters/cluster-f-market.ts`

- [ ] **Step 1: Add Dune imports to Cluster F**

Read `src/lib/clusters/cluster-f-market.ts` first. Add imports at the top:

```typescript
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";
```

- [ ] **Step 2: Add Dune calls for `dex_volume_7d` and `stablecoin_supply_trend`**

Follow the same pattern as Task 4. Inside the `try` block, after `serviceConfigs` and before the `for` loop:

```typescript
          // Dune temporal data (non-blocking)
          const dunePromises: Promise<import("../services/dune").DuneCacheResult | null>[] = [];
          const duneLabels: string[] = [];

          // DEX volume — only if we have a contract address
          if (contractAddress) {
            const dexTpl = getTemplate("dex_volume_7d");
            if (dexTpl && isTemplateReady(dexTpl)) {
              dunePromises.push(queryDune("dex_volume_7d", dexTpl.duneQueryId, { token_address: contractAddress, chain }).catch(() => null));
              duneLabels.push("dex_volume_7d");
            }
          }

          // Stablecoin supply trend — always available (chain-only param)
          const stableTpl = getTemplate("stablecoin_supply_trend");
          if (stableTpl && isTemplateReady(stableTpl)) {
            dunePromises.push(queryDune("stablecoin_supply_trend", stableTpl.duneQueryId, { chain }).catch(() => null));
            duneLabels.push("stablecoin_supply_trend");
          }

          const duneResultsPromise = Promise.all(dunePromises);
```

After the service `for` loop, await and add results:

```typescript
          // Await Dune results
          const duneResults = await duneResultsPromise;
          const duneData: Record<string, unknown> = {};
          for (let i = 0; i < duneLabels.length; i++) {
            if (duneResults[i]?.rows?.length) {
              duneData[duneLabels[i]] = duneResults[i]!.rows;
            }
          }
          if (Object.keys(duneData).length > 0) {
            calls.push({
              serviceName: "Dune Analytics (temporal)",
              data: duneData,
              costMicroUsdc: 0,
              paid: false,
            });
          }
```

Note: `contractAddress` and `chain` come from Cluster F's existing tool input schema. Check the file for exact variable names — Cluster F takes `query` (string topic) and optional `contractAddress` + `chain`.

Update the summary to mention Dune when present.

The `finally` block remains unchanged.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/clusters/cluster-f-market.ts
git commit -m "feat(dune): add DEX volume + stablecoin supply to Cluster F"
```

---

### Task 7: Cluster A Integration (DeFi Safety)

**Files:**
- Modify: `src/lib/clusters/cluster-a-defi.ts`

- [ ] **Step 1: Add Dune imports and calls to Cluster A**

Read `src/lib/clusters/cluster-a-defi.ts` first. Add imports:

```typescript
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";
```

Follow the same pattern as Task 4. Add Dune calls for `liquidation_risk` and `dex_pair_depth` — both take `token_address` and `chain`. Fire them in parallel with `Promise.all` before the service loop, await after the loop.

```typescript
          // Dune temporal data (non-blocking)
          const duneTemplates = ["liquidation_risk", "dex_pair_depth"] as const;
          const dunePromises = duneTemplates.map((tpl) => {
            const template = getTemplate(tpl);
            if (!template || !isTemplateReady(template)) return Promise.resolve(null);
            return queryDune(tpl, template.duneQueryId, { token_address: address, chain }).catch(() => null);
          });
          const duneResultsPromise = Promise.all(dunePromises);
```

After the service loop, collect results into `duneData` and push as a zero-cost service call (same as Task 4 pattern).

Update the summary and telemetry. The `finally` block remains unchanged.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/clusters/cluster-a-defi.ts
git commit -m "feat(dune): add liquidation risk + liquidity depth to Cluster A"
```

---

### Task 8: Cluster E Integration (Token Alpha)

**Files:**
- Modify: `src/lib/clusters/cluster-e-alpha.ts`

- [ ] **Step 1: Add Dune imports and calls to Cluster E**

Read `src/lib/clusters/cluster-e-alpha.ts` first. Add imports:

```typescript
import { queryDune } from "../services/dune";
import { getTemplate, isTemplateReady } from "../services/dune-templates";
```

Follow the same pattern as Task 4. Add Dune calls for `smart_money_moves_7d` and `token_velocity` — both take `token_address` and `chain`.

**Important:** Cluster E accepts name/symbol OR address as input. Only fire Dune calls if the input is an `0x` address:

```typescript
          // Dune temporal data — only if input is an address (not name/symbol)
          const isAddress = typeof tokenInput === "string" && /^0x[0-9a-fA-F]{40}$/.test(tokenInput);
          const dunePromises = isAddress
            ? (["smart_money_moves_7d", "token_velocity"] as const).map((tpl) => {
                const template = getTemplate(tpl);
                if (!template || !isTemplateReady(template)) return Promise.resolve(null);
                return queryDune(tpl, template.duneQueryId, { token_address: tokenInput, chain }).catch(() => null);
              })
            : [];
          const duneResultsPromise = Promise.all(dunePromises);
```

Check the file for the exact variable name for the token input (may be `address`, `token`, etc.) and adjust accordingly.

After the service loop, collect results and push as zero-cost service call. Update summary. The `finally` block remains unchanged.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/clusters/cluster-e-alpha.ts
git commit -m "feat(dune): add smart money + token velocity to Cluster E"
```

---

### Task 9: Standalone Tool + Orchestrator Update

**Files:**
- Modify: `src/lib/agents/orchestrator.ts`

- [ ] **Step 1: Add imports to orchestrator**

Read `src/lib/agents/orchestrator.ts` first. Add these imports at the top:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { queryDune } from "@/lib/services/dune";
import { DUNE_TEMPLATES, TEMPLATE_NAMES, getTemplate, isTemplateReady } from "@/lib/services/dune-templates";
import { CreditStore } from "@/lib/credits/credit-store";
import { handleReleaseFailure } from "@/lib/clusters/types";
```

Note: `tool` and `z` are NOT currently imported in `orchestrator.ts` (they are imported in the cluster files, not here). `ToolLoopAgent` and `stepCountIs` are already imported from `"ai"` — add `tool` to that import. `z` comes from `"zod"` as a new import.

- [ ] **Step 2: Add query_onchain_data tool definition**

Inside `createOrchestrator`, after `const clusterTools = ...` (line ~59) and before `const balanceText = ...` (line ~61), add:

```typescript
  const duneTools = options.walletClient ? {
    query_onchain_data: tool({
      description:
        "Query historical on-chain data from Dune Analytics. Pick a template and provide params. " +
        "Available templates:\n" +
        Object.values(DUNE_TEMPLATES).map(t => `- ${t.id}: ${t.description}`).join("\n") +
        "\nCosts $0.05 per query. Returns tabular data with rows.",
      inputSchema: z.object({
        template: z.enum(TEMPLATE_NAMES).describe("Template name to execute"),
        token_address: z.string().optional().describe("Token contract address (0x format)"),
        wallet_address: z.string().optional().describe("Wallet address (0x format)"),
        contract_address: z.string().optional().describe("Contract address (0x format)"),
        chain: z.enum(["ethereum", "base", "arbitrum", "optimism"]).default("ethereum")
          .describe("Chain to query"),
      }),
      execute: async (input) => {
        const tpl = getTemplate(input.template);
        if (!tpl) return { error: `Unknown template: ${input.template}` };
        if (!isTemplateReady(tpl)) return { error: `Template ${input.template} is not yet configured (no Dune query ID)` };

        // Reserve credits (already deducts — reservation IS payment)
        const costMicro = 50_000; // $0.05
        let reserved = false;
        if (options.userWallet) {
          const reservation = await CreditStore.reserve(options.userWallet, costMicro);
          if (!reservation.success) {
            return { error: "Insufficient credit balance for on-chain data query ($0.05). Please top up." };
          }
          reserved = true;
        }

        try {
          const params: Record<string, unknown> = { chain: input.chain };
          if (input.token_address) params.token_address = input.token_address;
          if (input.wallet_address) params.wallet_address = input.wallet_address;
          if (input.contract_address) params.contract_address = input.contract_address;

          const result = await queryDune(input.template, tpl.duneQueryId, params);

          if (!result) {
            // Release reservation — user not charged on failure
            if (reserved && options.userWallet) {
              await CreditStore.release(options.userWallet, costMicro).catch((err) =>
                handleReleaseFailure("DUNE_STANDALONE", options.userWallet!, costMicro, err),
              );
            }
            return { error: "On-chain data temporarily unavailable. Try again shortly." };
          }

          return {
            summary: `Dune Analytics: ${input.template} returned ${result.rows.length} rows${result.cacheHit ? " (cached)" : ""}.`,
            data: result.rows.slice(0, 50), // Limit rows sent to LLM context
            rowCount: result.rows.length,
            template: input.template,
            freshness: result.cacheHit ? "cached (< 15 min)" : "fresh",
          };
        } catch (err) {
          // Release reservation on unexpected error
          if (reserved && options.userWallet) {
            await CreditStore.release(options.userWallet, costMicro).catch((releaseErr) =>
              handleReleaseFailure("DUNE_STANDALONE", options.userWallet!, costMicro, releaseErr),
            );
          }
          console.error("[DUNE] Standalone tool error", err);
          return { error: "On-chain data query failed unexpectedly." };
        }
      },
    }),
  } : {};
```

- [ ] **Step 3: Add duneTools to the tools spread**

In the `return new ToolLoopAgent({...})` block, add `...duneTools` to the tools object:

```typescript
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
      ...discoveryTools,
      ...clusterTools,
      ...duneTools,
    },
```

- [ ] **Step 4: Update the system prompt**

Replace the DATA LIMITATIONS section (the block starting with `DATA LIMITATIONS — SNAPSHOT VS TEMPORAL DATA:` through `If the user asks a trend question and the only available data is a snapshot, lead with that caveat before presenting the data.`) with:

```
HISTORICAL ON-CHAIN DATA (Dune Analytics):
You have access to historical on-chain data via query_onchain_data and enriched cluster tools. Use this for trend questions like "are whales accumulating?", "is volume increasing?", "what are smart money wallets doing?"
- Cluster tools (track_whale_activity, analyze_wallet_portfolio, etc.) now include 7-day flow trends automatically — no need to call query_onchain_data separately for questions those clusters cover.
- Use query_onchain_data ($0.05) for questions outside cluster scope: bridge flows, stablecoin supply trends, flash loan activity, MEV exposure, contract interaction trends.
- If a question requires data outside the available templates (specific protocol internals, governance votes, historical price charts), acknowledge the limitation.
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/orchestrator.ts
git commit -m "feat(dune): add query_onchain_data tool + update orchestrator prompt"
```

---

### Task 10: Final Verification & Deploy

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 2: Local build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Test without DUNE_API_KEY (graceful degradation)**

Start local dev with no DUNE_API_KEY set. Send a chat message. Verify:
- Clusters return existing data (no errors)
- Server log shows `[DUNE] Skipped — no API key`
- `query_onchain_data` tool returns "not yet configured" error (query IDs are 0 — `isTemplateReady` fires before the API key check)

- [ ] **Step 4: Commit any fixes and push**

```bash
git push origin main
```

- [ ] **Step 5: Deploy**

```bash
vercel --prod --yes
```

Note: Dune features will be inactive until:
1. Real Dune query IDs are added to `dune-templates.ts`
2. `DUNE_API_KEY` is set as a Vercel env var
3. After updating IDs and env var, redeploy (`vercel --prod --yes`)

This is intentional — the infrastructure ships first, query IDs are filled in as queries are validated in the Dune UI.
