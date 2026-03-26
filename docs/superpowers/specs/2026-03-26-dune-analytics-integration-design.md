# Dune Analytics Integration — Design Spec

## Goal

Add temporal on-chain data to Obol AI by integrating Dune Analytics. Current x402 services only provide point-in-time snapshots (who holds what now). Users asking trend questions ("are whales accumulating?", "is volume increasing?") get incomplete answers. Dune provides historical flow data, exchange balances, lending metrics, and labeled wallet activity that fills this gap.

## Prerequisites

**Before writing any code**, create and validate all 14 Dune queries in the Dune query editor UI. Record the real query IDs. The `duneQueryId` fields in the template registry are placeholders until this step is done. Start with Tier 1 (5 queries), then Tier 2, then Tier 3.

**Dune plan:** Analyst tier (~$50/mo) recommended for production. Free tier is sufficient for development and testing. Estimated production usage: ~300-500 executions/day before cache hits, dropping to ~50-100 actual Dune executions/day with 15-min Redis cache.

## Architecture

Three components: a Dune REST client, a Redis cache layer, and integration points (inside clusters + standalone tool).

**Key decisions:**
- REST API (not MCP) for Phase 1 — cacheable, predictable, no connection lifecycle overhead
- Dune MCP server reserved for Phase 2 (dynamic table discovery, raw SQL — see Memory)
- 14 parameterized query templates, not raw SQL — predictable cost, cacheable
- Dune data is additive — clusters degrade gracefully if Dune is slow or down
- Uniform 15-minute cache TTL on all templates
- Standalone tool priced at $0.05; Dune data inside clusters is bundled at no extra cost
- When `DUNE_API_KEY` is unset, all Dune calls are skipped silently in all environments (including testnet)

## Components

### 1. Dune Client — `src/lib/services/dune.ts`

Thin wrapper around two Dune REST endpoints:

```
POST https://api.dune.com/api/v1/query/{query_id}/execute
  → returns { execution_id, state }

GET https://api.dune.com/api/v1/execution/{execution_id}/results
  → returns { state, result: { rows, metadata }, is_execution_finished }
```

Also supports a fast path via `GET /api/v1/query/{query_id}/results` which returns the latest cached result from Dune without triggering a new execution. The client tries this endpoint first; if the result is stale (older than 15 min) or absent, it falls back to execute+poll. This dramatically reduces Dune credit consumption.

Behavior:
- Auth: `X-Dune-API-Key` header from `env.DUNE_API_KEY`
- Fast path: try latest-result endpoint first (free, instant if fresh)
- Polling fallback: 2-second intervals, max 30 seconds, then return null (leaves headroom for Vercel's function timeout)
- Dune 402 (credits exhausted): log error, send Telegram alert, return null
- Dune 401 (auth failure): log error, return null (no Telegram alert — not actionable per-request)
- All other errors: log, return null (never throw — callers handle null gracefully)

### 2. Cache Layer — same file or co-located

Wraps DuneClient with Upstash Redis caching (same instance as rate limiting).

- Key format: `dune:{template_name}:{sha256(stableStringify(params))}` where `stableStringify` sorts object keys alphabetically before JSON.stringify (e.g., `JSON.stringify(Object.fromEntries(Object.entries(params).sort()))`) to ensure deterministic hashing regardless of param insertion order
- TTL: 15 minutes (uniform across all templates)
- Cache hit: return immediately, no Dune credit spent
- Cache miss: execute on Dune, cache result, return
- Redis down: bypass cache, call Dune directly (graceful degradation)

### 3. Template Registry — `src/lib/services/dune-templates.ts`

Each template maps a human-readable name to a saved Dune query ID with typed parameters.

```typescript
interface DuneTemplate {
  id: string;                    // e.g., "whale_net_flow_7d"
  duneQueryId: number;           // saved Dune query ID
  description: string;           // for agent tool selection
  params: TemplateParam[];       // { name, type, required }
}
```

### 4. Env — `src/lib/env.ts`

Add to server schema:
- `DUNE_API_KEY: z.string().optional()` — Dune features disabled when not set

## Query Templates (14)

### Tier 1 — Core (5)

| Template | Dune Table | Params | Used In |
|----------|-----------|--------|---------|
| `whale_net_flow_7d` | `tokens.transfers` + `labels` | token_address, chain | Cluster B |
| `cex_net_flow_7d` | `cex.flows` | token_address, chain | Cluster B, standalone |
| `top_holder_changes_7d` | `tokens_<chain>.balances_daily` | token_address, chain | Cluster C |
| `dex_volume_7d` | `dex.trades` | token_address, chain | Cluster F, standalone |
| `wallet_pnl_30d` | `dex.trades` + `balances` | wallet_address, chain | Cluster C |

### Tier 2 — Differentiating (5)

| Template | Dune Table | Params | Used In |
|----------|-----------|--------|---------|
| `liquidation_risk` | `lending.borrow` | token_address, chain | Cluster A, standalone |
| `bridge_flow_7d` | `bridges.flows` | chain | standalone |
| `stablecoin_supply_trend` | `stablecoins` | chain | standalone |
| `smart_money_moves_7d` | `labels` + `tokens.transfers` | token_address, chain | Cluster B, E |
| `dex_pair_depth` | `dex.trades` | token_address, chain | Cluster A, standalone |

### Tier 3 — Extended (4)

| Template | Dune Table | Params | Used In |
|----------|-----------|--------|---------|
| `flash_loan_activity` | `lending.flashloans` | token_address, chain | standalone |
| `contract_interaction_trend` | raw transactions | contract_address, chain | standalone |
| `token_velocity` | `tokens.transfers` | token_address, chain | Cluster E |
| `mev_exposure` | `dex.trades` (sandwich detection) | token_address, chain | standalone |

**Rollout order:** Build the Dune client + cache infra first, then add templates in tier order. Each tier is independently deployable — Tier 1 can ship and be verified before Tier 2 queries are written in Dune.

## Cluster Integration

| Cluster | Dune Templates Added | Improvement |
|---------|---------------------|-------------|
| A (DeFi Safety) | `liquidation_risk`, `dex_pair_depth` | Adds liquidation exposure + real liquidity data |
| B (Whale Tracking) | `whale_net_flow_7d`, `cex_net_flow_7d`, `smart_money_moves_7d` | Answers "are whales accumulating?" with actual flow data |
| C (Portfolio) | `top_holder_changes_7d`, `wallet_pnl_30d` | Wallet performance over time, not just current state |
| D (Social) | none | Sentiment-focused, no on-chain data needed |
| E (Alpha) | `smart_money_moves_7d`, `token_velocity` | Smart money signal + speculation vs utility |
| F (Market) | `dex_volume_7d`, `stablecoin_supply_trend` | Real volume data backing up sentiment |

**Integration pattern:**

```typescript
// Dune call added to existing parallel batch — non-blocking
const [qsResult, slamaiResult, duneResult] = await Promise.all([
  qsCall,
  slamaiCall,
  duneCache.get("whale_net_flow_7d", { token, chain }).catch(() => null),
]);

// If Dune returns null (timeout, error, no data), cluster returns existing data unchanged
```

## Standalone Tool

```
Tool: query_onchain_data
Cost: $0.05 flat
Input:
  - template: enum of 14 template names
  - params: { token_address?, wallet_address?, contract_address?, chain? }
Output: { template, freshness, row_count, data: rows[] }
```

**Credit deduction:** Uses the same reserve → deduct → forceDeduct → Telegram alert pattern as cluster tools (not the simpler MCP flat-deduct path). The $0.05 is reserved upfront; if the Dune query returns null (timeout/error), the reservation is released and the user is not charged.

**Tool card display:** `✓ On-Chain Data · whale_net_flow_7d · 42 rows · $0.05` — shows template name, row count, and cost.

The orchestrator system prompt lists available templates with one-line descriptions. The agent picks the best template for the question.

**Routing logic:**
- "Are whales accumulating ETH?" → Cluster B (Dune included internally)
- "Is capital flowing into Base?" → `query_onchain_data` / `bridge_flow_7d`
- "Flash loan activity for AAVE?" → `query_onchain_data` / `flash_loan_activity`

## Error Handling & Observability

- Dune API errors → logged, Telegram alert if credits exhausted
- Query timeout (>60s) → return null, cluster continues without Dune data
- Redis errors → bypass cache, call Dune directly
- Telemetry: `dune_query` structured log event: `{ template, params, cache_hit, duration_ms, row_count }`
- Telegram alert: `*Dune Credits Low*` when usage >80% of billing period

## Orchestrator Prompt Update

Add to system prompt:
- List of `query_onchain_data` templates with descriptions
- Guidance: "For temporal/trend questions, prefer query_onchain_data or cluster tools that include Dune data. For current-state questions, existing tools are sufficient."
- Replace the DATA LIMITATIONS section: remove the blanket caveat recommending external platforms. Instead: "You now have access to historical on-chain data via Dune Analytics (whale flows, exchange balances, DEX volume, lending metrics, bridge flows). Use this data to answer trend questions. If a question requires data outside the available templates (e.g., specific protocol internals, governance votes), acknowledge the limitation."
- Update cluster cost annotations in the prompt to reflect that Dune-enriched clusters may take slightly longer (due to the parallel Dune call) but cost the user the same

## Files Changed

| File | Change |
|------|--------|
| `src/lib/services/dune.ts` | New — Dune REST client + cache layer |
| `src/lib/services/dune-templates.ts` | New — 14 template definitions |
| `src/lib/env.ts` | Add `DUNE_API_KEY` to server schema |
| `src/lib/clusters/cluster-a-defi.ts` | Add Dune calls (liquidation_risk, dex_pair_depth) |
| `src/lib/clusters/cluster-b-whale.ts` | Add Dune calls (whale_net_flow_7d, cex_net_flow_7d, smart_money_moves_7d) |
| `src/lib/clusters/cluster-c-portfolio.ts` | Add Dune calls (top_holder_changes_7d, wallet_pnl_30d) |
| `src/lib/clusters/cluster-e-alpha.ts` | Add Dune calls (smart_money_moves_7d, token_velocity) |
| `src/lib/clusters/cluster-f-market.ts` | Add Dune calls (dex_volume_7d, stablecoin_supply_trend) |
| `src/lib/agents/orchestrator.ts` | Add query_onchain_data tool + template list in prompt |
| `src/lib/tool-prices.ts` | Add query_onchain_data pricing |
| `src/lib/tool-display-config.ts` | Add display config for Dune tool card |
| `.env.example` | Add `DUNE_API_KEY` placeholder |

## Verification & Test Plan

### Test 1: Cache behavior
```
1. Clear Redis keys matching dune:*
2. Call query_onchain_data with template=dex_volume_7d, token=ETH, chain=ethereum
3. Verify: response returns rows, takes 5-30s (cache miss, live Dune execution)
4. Call same query again immediately
5. Verify: response returns same data, takes <100ms (cache hit)
6. Check Redis: key dune:dex_volume_7d:{hash} exists with TTL ~900s
7. Call with params in different order (chain=ethereum, token=ETH) — verify same cache hit (deterministic key)
```

### Test 2: Cluster enrichment (Cluster B — whale tracking)
```
1. Ask Obol: "Are whales accumulating ETH right now?"
2. Verify response includes:
   - QuantumShield holder distribution (existing — snapshot)
   - Dune whale net flow data (new — "over the past 7 days, large wallets have net bought/sold X ETH")
   - CEX flow data (new — "net exchange outflow of X ETH suggests accumulation")
3. Verify: response does NOT present snapshot data as trend evidence
4. Verify: response uses temporal language ("over the past 7 days", "trending up/down")
```

### Test 3: Cluster enrichment (Cluster C — portfolio)
```
1. Ask Obol: "Analyze wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
2. Verify response includes:
   - Existing wallet risk + trade data
   - Dune top holder changes (new — relative position change)
   - Dune wallet PnL (new — 30-day performance)
```

### Test 4: Standalone tool
```
1. Ask Obol: "Is capital flowing into Base from Ethereum?"
2. Verify: agent uses query_onchain_data with template=bridge_flow_7d
3. Verify: response shows bridge net flow data with directional analysis
4. Verify: cost shown as $0.05
```

### Test 5: Graceful degradation (no API key)
```
1. Unset DUNE_API_KEY
2. Ask Obol: "Are whales accumulating ETH?"
3. Verify: Cluster B still returns QuantumShield data (existing behavior)
4. Verify: no error shown to user — Dune data simply absent
5. Verify: server log shows "Dune skipped — no API key"
```

### Test 5b: Graceful degradation (invalid API key)
```
1. Set DUNE_API_KEY to an invalid value
2. Ask Obol: "Are whales accumulating ETH?"
3. Verify: Cluster B still returns QuantumShield data
4. Verify: no error shown to user
5. Verify: server log shows 401 error (no Telegram alert — auth errors are not actionable per-request)
```

### Test 5c: Dune credits exhausted
```
1. Trigger a Dune 402 response (credits depleted)
2. Verify: return null, cluster degrades gracefully
3. Verify: Telegram alert sent (this IS actionable — need to upgrade plan or wait for billing reset)
```

### Test 6: Dune timeout
```
1. Use a Dune query that takes >30s (the poll timeout)
2. Verify: cluster returns within reasonable time with existing data
3. Verify: dune_query telemetry event shows timeout
(Manual test — verified by code review of timeout logic + production monitoring)
```

### Test 7: Before/after comparison
```
Run these queries BEFORE and AFTER the integration and compare:

| Query | Before (snapshot only) | After (snapshot + temporal) |
|-------|----------------------|---------------------------|
| "Are whales accumulating ETH?" | Holder distribution, no trend | Holder dist + 7d net flow + CEX flow |
| "How safe is the AAVE contract?" | Security score + audit | Security + liquidation risk + liquidity depth |
| "Analyze Vitalik's wallet" | Current holdings + risk | Holdings + 30d PnL + position changes |
| "What's the buzz around BTC?" | Sentiment only | Sentiment + actual DEX volume backing |
| "Screen PEPE for alpha" | Token security + unlocks | Security + smart money moves + velocity |
| "Is capital moving to L2s?" | No answer possible | Bridge flow + stablecoin supply data |
```

## Phase 2 Upgrade Path (Future)

Connect to Dune MCP server (`https://api.dune.com/mcp/v1`) for:
- Dynamic table discovery via `searchTables`
- Raw SQL execution for novel questions templates can't answer
- Agent-written DuneSQL with credit cap
- Dune MPP (HTTP 402 micropayments) when x402 ecosystem matures

See project memory for full Phase 2 details.
