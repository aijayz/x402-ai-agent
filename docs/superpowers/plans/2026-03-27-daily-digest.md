# Daily Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily cron job that collects crypto market data from existing sources (CoinGecko, Dune, GenVox), pre-reduces it to compact summaries, synthesizes with AI, and publishes a shareable daily briefing at `/digest`.

**Architecture:** A collector module fetches all data sources in parallel, then each source is **reduced to headline numbers** before being passed to AI. This solves the context overflow problem (raw Dune responses can be 50KB+ per query, but the AI only needs ~100 bytes of summary per source). The result is saved as a `type = 'digest'` report in the existing `reports` table.

**Tech Stack:** CoinGecko REST API, Dune (existing `queryDune`), GenVox sentiment (x402, with Redis cache), AI SDK `generateText`, ReportStore, Satori OG images.

**Design spec:** `docs/superpowers/specs/2026-03-26-shareable-reports-daily-digest-design.md` (Part 2)

**Prerequisite:** Shareable Reports (Phase 1) is complete — `reports` table already has `type` + `digest_date` columns, `ReportStore` has `getLatestDigest()`.

---

## Key Design Decision: Pre-Reduction

Raw vendor responses overflow the AI context window (306K tokens vs 131K limit — already hit in production). The collector does NOT pass raw data to the AI. Instead, each source has a **reducer** that extracts just the headline numbers:

| Source | Raw size | Reduced to | ~Size |
|--------|----------|------------|-------|
| CoinGecko prices | ~5KB | 10 × `{ symbol, price, change24h, marketCap }` | ~1KB |
| Dune whale flows | ~50KB/query | `{ token, netFlowUsd, inflowUsd, outflowUsd, largeTxCount }` | ~200B |
| Dune CEX flows | ~50KB/query | `{ token, netFlowUsd, direction, topExchangeCount }` | ~200B |
| Dune stablecoin supply | ~30KB/query | `{ chain, currentSupplyUsd, change30dUsd, changePercent }` | ~150B |
| GenVox sentiment | ~5KB | `{ token, score, label, summary }` | ~200B |
| **Total AI payload** | | | **~3KB** |

This keeps the AI prompt well under any model's context limit.

## Key Design Decision: Drop Messari

Messari's free `token-unlocks/v1/assets` endpoint is a **catalog lookup** (symbol, category, sector, genesis/end dates) — it does NOT provide actual unlock schedules (dates, amounts, USD values). The paid allocations endpoint ($0.25/call) is too expensive for a daily digest covering multiple tokens. Messari is dropped from v1. If unlock data is needed later, a Dune query watching on-chain vesting contract claims would be cheaper and more granular.

## Key Design Decision: GenVox Redis Cache

GenVox sentiment is the only paid x402 service in the digest ($0.03/call). Add a Redis cache layer with 30-min TTL to deduplicate calls. If a user asked about BTC sentiment recently, the digest gets it free.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/digest/tokens.ts` | **New** — Token selection: 6 fixed majors + top 4 gainers from CoinGecko top 100 |
| `src/lib/digest/collector.ts` | **New** — Parallel data fetching + reduction from all sources |
| `src/lib/digest/reducers.ts` | **New** — Per-source reducers that extract headline numbers from raw responses |
| `src/lib/digest/generator.ts` | **New** — AI synthesis prompt + generateText call |
| `src/lib/digest/types.ts` | **New** — TypeScript types for both raw and reduced digest data |
| `src/app/api/digest/generate/route.ts` | **New** — Cron endpoint (POST, CRON_SECRET protected) |
| `src/app/digest/page.tsx` | **New** — Latest digest page (server component) |
| `src/app/digest/[date]/page.tsx` | **New** — Archived digest by date |
| `src/app/digest/digest-viewer.tsx` | **New** — Shared client component for digest rendering |
| `src/app/digest/opengraph-image.tsx` | **New** — Satori OG card for latest digest |
| `src/app/digest/[date]/opengraph-image.tsx` | **New** — Satori OG card for dated digest |
| `src/app/digest/not-found.tsx` | **New** — 404 page for missing digests |
| `src/lib/reports/report-store.ts` | **Modify** — Add `getDigestByDate()` method |
| `src/lib/reports/parse-markers.ts` | **New** — Extract shared `extractMarkers` + `extractTitle` from route.ts |
| `src/app/api/reports/route.ts` | **Modify** — Import from shared parse-markers.ts |
| `vercel.json` | **Modify** — Add digest cron schedule |
| `src/app/page.tsx` | **Modify** — Add digest preview section to landing page |

---

## Step 1: Types & Token Selection

- [ ] **1a.** Create `src/lib/digest/types.ts` with the digest data payload types:

```ts
// ── Raw types (what vendors return) ──────────────────────────

export interface TokenPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number;       // percentage
  marketCap: number;
  volume24h: number;
  isFixed: boolean;        // true for the 6 majors, false for dynamic slots
}

// ── Reduced types (what goes to AI) ──────────────────────────

export interface ReducedWhaleFlow {
  token: string;           // "ETH"
  chain: string;           // "ethereum"
  netFlowUsd: number;      // negative = outflow (accumulation)
  inflowUsd: number;
  outflowUsd: number;
  largeTxCount: number;    // transfers > $100k
}

export interface ReducedCexFlow {
  token: string;
  chain: string;
  netFlowUsd: number;      // negative = exchange outflow (bullish)
  direction: "inflow" | "outflow" | "neutral";
}

export interface ReducedStablecoinSupply {
  chain: string;
  currentSupplyUsd: number;
  change30dUsd: number;
  changePercent: number;
}

export interface ReducedSentiment {
  token: string;
  score: number | null;     // 0-100 or null if unavailable
  label: string | null;     // "bullish", "bearish", "neutral"
  summary: string | null;   // one-sentence summary from GenVox
}

// ── Digest payload (passed to AI generator) ──────────────────

export interface DigestData {
  date: string;                                  // "2026-03-27"
  prices: TokenPrice[];                          // 10 tokens
  whaleFlows: ReducedWhaleFlow[];               // ETH, BTC
  cexFlows: ReducedCexFlow[];                   // ETH, BTC
  stablecoinSupply: ReducedStablecoinSupply[];  // ethereum, base
  sentiment: ReducedSentiment[];                 // BTC, ETH + 1-2 top movers
  errors: string[];                              // list of sources that failed (for metadata)
}
```

- [ ] **1b.** Create `src/lib/digest/tokens.ts`:
  - Export `FIXED_MAJORS` — CoinGecko IDs: `["bitcoin", "ethereum", "solana", "binancecoin", "ripple", "cardano"]`
  - Export `FIXED_SYMBOLS` map: `{ bitcoin: "BTC", ethereum: "ETH", solana: "SOL", binancecoin: "BNB", ripple: "XRP", cardano: "ADA" }`
  - Export `async function getDigestTokens(): Promise<TokenPrice[]>`:
    - Fetch `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false&price_change_percentage=24h`
    - Map the 6 fixed majors from the response (always present in top 100), set `isFixed: true`
    - Sort remaining 94 by `price_change_percentage_24h` descending
    - Take top 4 (excluding the 6 fixed), set `isFixed: false`
    - Return 10 `TokenPrice` objects
    - On CoinGecko error: return just the 6 fixed with `price: 0, change24h: 0` (graceful degradation)
  - Use `AbortSignal.timeout(8000)` for the fetch
  - No auth needed (CoinGecko free tier supports `/coins/markets`)
  - Use `COINGECKO_BASE` from existing `src/lib/services/coingecko.ts` (import the constant or read from env)

**Testing:** Call `getDigestTokens()` from a scratch script and verify 10 tokens are returned with the 4 dynamic slots varying by day.

---

## Step 2: Reducers

- [ ] **2a.** Create `src/lib/digest/reducers.ts` with per-source reducer functions:

```ts
import type { ReducedWhaleFlow, ReducedCexFlow, ReducedStablecoinSupply, ReducedSentiment } from "./types";
import type { DuneCacheResult } from "@/lib/services/dune";

/** Reduce raw Dune whale_net_flow_7d rows to headline numbers */
export function reduceWhaleFlow(
  token: string,
  chain: string,
  raw: DuneCacheResult | null
): ReducedWhaleFlow {
  if (!raw || !raw.rows.length) {
    return { token, chain, netFlowUsd: 0, inflowUsd: 0, outflowUsd: 0, largeTxCount: 0 };
  }
  // Sum rows: each row has direction (in/out), amount_usd
  let inflow = 0, outflow = 0, count = 0;
  for (const row of raw.rows) {
    const amt = Number(row.amount_usd ?? row.net_flow ?? 0);
    if (amt > 0) inflow += amt;
    else outflow += Math.abs(amt);
    count++;
  }
  return { token, chain, netFlowUsd: inflow - outflow, inflowUsd: inflow, outflowUsd: outflow, largeTxCount: count };
}

/** Reduce raw Dune cex_net_flow_7d rows */
export function reduceCexFlow(
  token: string,
  chain: string,
  raw: DuneCacheResult | null
): ReducedCexFlow { ... }

/** Reduce raw Dune stablecoin_supply_trend rows */
export function reduceStablecoinSupply(
  chain: string,
  raw: DuneCacheResult | null
): ReducedStablecoinSupply { ... }

/** Reduce raw GenVox sentiment response */
export function reduceSentiment(
  token: string,
  raw: unknown
): ReducedSentiment { ... }
```

- [ ] **2b.** Each reducer must handle:
  - `null` input (source failed) → return zeroed/empty struct
  - Unexpected row shapes → use `Number(row.field ?? 0)` with fallbacks
  - Column name variations (Dune queries may use different column names) → check the actual query outputs

**Important:** The exact column names in Dune rows depend on the SQL in each query. Before implementing, check a sample response from each Dune template to confirm field names. You can do this by calling `queryDune` with a known token address and logging the result, or checking the Dune query editor output.

**Testing:** Unit test each reducer with sample Dune row data (mock the shapes). Verify output matches the reduced types.

---

## Step 3: Data Collector

- [ ] **3a.** Create `src/lib/digest/collector.ts`:
  - Export `async function collectDigestData(): Promise<DigestData>`
  - Two-phase fetch to handle the price → sentiment dependency:

```ts
export async function collectDigestData(): Promise<DigestData> {
  const errors: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Phase 1: Prices (needed to pick top movers for sentiment)
  const prices = await getDigestTokens().catch(err => {
    errors.push(`prices: ${err.message}`);
    return [] as TokenPrice[];
  });

  // Pick top 2 dynamic movers for sentiment (in addition to BTC, ETH)
  const dynamicMovers = prices.filter(p => !p.isFixed).slice(0, 2).map(p => p.symbol);
  const sentimentTokens = ["BTC", "ETH", ...dynamicMovers];

  // Phase 2: Everything else in parallel
  const [whaleRaw, cexRaw, stableRaw, sentimentRaw] = await Promise.allSettled([
    collectDuneQueries("whale"),
    collectDuneQueries("cex"),
    collectDuneQueries("stablecoin"),
    collectSentiment(sentimentTokens),
  ]);

  // Reduce raw responses to headline numbers
  return {
    date: today,
    prices,
    whaleFlows: extractSettled(whaleRaw, errors, "whale_flows"),
    cexFlows: extractSettled(cexRaw, errors, "cex_flows"),
    stablecoinSupply: extractSettled(stableRaw, errors, "stablecoin"),
    sentiment: extractSettled(sentimentRaw, errors, "sentiment"),
    errors,
  };
}
```

- [ ] **3b.** Implement `collectDuneQueries("whale")`:
  - Call `queryDune("whale_net_flow_7d", queryId, { token_address, chain })` for ETH and BTC
  - Well-known addresses:
    - ETH on ethereum: `0x0000000000000000000000000000000000000000`
    - WBTC on ethereum: `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599`
  - Apply `reduceWhaleFlow()` to each result
  - Return `ReducedWhaleFlow[]`

- [ ] **3c.** Implement `collectDuneQueries("cex")`:
  - Call `queryDune("cex_net_flow_7d", queryId, { token_address, chain })` for ETH, BTC
  - Same addresses as whale flows
  - Apply `reduceCexFlow()` to each result

- [ ] **3d.** Implement `collectDuneQueries("stablecoin")`:
  - Call `queryDune("stablecoin_supply_trend", queryId, { chain })` for `"ethereum"` and `"base"`
  - Apply `reduceStablecoinSupply()` to each result

- [ ] **3e.** Implement `collectSentiment(tokens: string[])`:
  - For each token, check Redis cache first: key `genvox:sentiment:{token.toLowerCase()}`, TTL 30 min
  - On cache miss: call GenVox via x402 (`callWithPayment`) — accept the cost (~$0.03/call)
  - Cache successful responses in Redis
  - Apply `reduceSentiment()` to each result
  - Return `ReducedSentiment[]`
  - On error per token: return `{ token, score: null, label: null, summary: null }`

- [ ] **3f.** Helper: `extractSettled()` — unwrap `PromiseSettledResult`, push rejection reason to errors array, return value or empty array.

**Key principle:** Every sub-collector catches its own errors. The digest generates even if some sources fail — the `errors` array tracks what's missing, and the AI prompt tells the model to skip unavailable sections.

**Dedup strategy:**
- Dune: existing Redis cache (15-min TTL) handles dedup automatically
- GenVox: new Redis cache (30-min TTL) added in step 3e
- CoinGecko: single batch call, no dedup needed

**Testing:** Call `collectDigestData()` and `JSON.stringify` the result. Verify the total payload is ~3-5KB (not 300KB). Check that Dune/GenVox results come from Redis cache when available.

---

## Step 4: AI Generator

- [ ] **4a.** Extract `extractMarkers()` and `extractTitle()` from `src/app/api/reports/route.ts` into `src/lib/reports/parse-markers.ts`. Update `route.ts` to import from the shared module.

- [ ] **4b.** Create `src/lib/digest/generator.ts`:
  - Export `async function generateDigest(data: DigestData): Promise<{ title: string; content: string; markers: unknown[] }>`
  - Uses `generateText` from AI SDK
  - Model: use `getActiveModel()` from `ai-provider.ts` (respects fallback chain)
  - System prompt:

```
You are Obol's market analyst. Generate a concise daily crypto briefing from the pre-processed data below.

Structure your briefing with these sections (skip any section where the data is empty or missing):

1. **Market Overview** — prices + 24h changes. Use [METRIC:symbol|$price|+X.X%] for each token.
2. **Whale & Exchange Signals** — net flows, CEX flows. Negative CEX flow = exchange outflow = bullish accumulation signal.
3. **Liquidity & Macro** — stablecoin supply changes. Growing supply = buying power entering the ecosystem.
4. **Sentiment Pulse** — social mood for tracked tokens. Use [SCORE:Token Sentiment|N/100] for scored tokens.
5. **Daily Verdict** — one-sentence synthesis of the overall market picture. Use [VERDICT:your verdict text|green/amber/red].

Rules:
- Use [METRIC:label|value|change], [SCORE:label|n/max], [VERDICT:text|color] markers throughout
- Be concise. No filler. Every sentence should convey a signal.
- Do NOT mention data sources by name (no "Dune says", "GenVox reports")
- Do NOT mention any data that is missing or unavailable — just skip that section
- Interpret the numbers — don't just restate them. "ETH whale outflow of -$2.3M alongside +40% DEX volume suggests profit-taking, not capitulation" is analysis.
- Total output should be 400-800 words
```

  - User message: `JSON.stringify(data)` — this is the pre-reduced ~3KB payload
  - After generation:
    - Extract title from VERDICT marker via `extractTitle()`, fallback to `"Daily Briefing — {formatted date}"`
    - Parse markers via `extractMarkers()`
  - Return `{ title, content, markers }`

**Testing:** Pass a mock `DigestData` payload to `generateDigest()` and verify it produces valid markdown with markers under 1000 words.

---

## Step 5: Report Store Update

- [ ] **5a.** Add `getDigestByDate(date: string)` to `ReportStore`:

```ts
async getDigestByDate(date: string): Promise<Report | null> {
  const rows = await sql`
    SELECT * FROM reports WHERE type = 'digest' AND digest_date = ${date} LIMIT 1
  `;
  return rows.length > 0 ? mapRow(rows[0]) : null;
},
```

This enables `/digest/2026-03-27` lookups. `getLatestDigest()` already exists for `/digest`.

---

## Step 6: Cron Endpoint

- [ ] **6a.** Create `src/app/api/digest/generate/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ReportStore } from "@/lib/reports/report-store";
import { collectDigestData } from "@/lib/digest/collector";
import { generateDigest } from "@/lib/digest/generator";
import { sendTelegramAlert } from "@/lib/telegram";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Verify CRON_SECRET (same pattern as check-topups)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Idempotency: skip if today's digest already exists
  const existing = await ReportStore.getDigestByDate(today);
  if (existing) {
    return NextResponse.json({ status: "already_exists", id: existing.id });
  }

  try {
    // Collect → Reduce → Generate → Save
    const data = await collectDigestData();
    const { title, content, markers } = await generateDigest(data);

    const report = await ReportStore.create({
      title,
      content,
      markers,
      metadata: {
        type: "daily_digest",
        date: today,
        tokenCount: data.prices.length,
        sourcesOk: 5 - data.errors.length,
        sourcesFailed: data.errors,
      },
      type: "digest",
      digestDate: today,
    });

    return NextResponse.json({ status: "created", id: report.id, date: today });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DIGEST] Generation failed", msg);
    await sendTelegramAlert(`*Digest Generation Failed*\n\n${today}\n${msg}`).catch(() => {});
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
```

- [ ] **6b.** Telegram alert on both failure (error) and success with partial data (errors array non-empty).

**Testing:** Call locally: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/digest/generate`. Verify a digest report is created in the DB and the content is ~3KB of markdown with markers.

---

## Step 7: Digest Pages

- [ ] **7a.** Create `src/app/digest/digest-viewer.tsx` — shared client component:
  - Reuse `ReportViewer` from `/r/[id]/report-viewer.tsx` as much as possible
  - Add digest-specific header: "Daily Briefing — March 27, 2026"
  - Add prev/next day navigation arrows (link to `/digest/YYYY-MM-DD`)
  - Add "Try Obol" CTA button → `/chat`
  - Show "Generated at HH:MM UTC" timestamp

- [ ] **7b.** Create `src/app/digest/page.tsx`:
  - Server component
  - Fetch latest digest via `ReportStore.getLatestDigest()`
  - If none exists, show a "No digest available yet" message
  - Pass report to `DigestViewer`
  - Metadata: `title: "Daily Briefing — Obol AI"`, dynamic description from verdict

- [ ] **7c.** Create `src/app/digest/[date]/page.tsx`:
  - Server component
  - Validate date format (YYYY-MM-DD regex)
  - Fetch via `ReportStore.getDigestByDate(date)`
  - If not found, `notFound()`
  - Same viewer component

- [ ] **7d.** Create `src/app/digest/not-found.tsx` — simple 404 with link to `/digest`.

**Testing:** Generate a digest via step 6, then visit `/digest` and `/digest/2026-03-27` in the browser. Verify rendering, navigation arrows, and metadata.

---

## Step 8: OG Images

- [ ] **8a.** Create `src/app/digest/opengraph-image.tsx`:
  - Fetch latest digest from DB
  - Render Satori card:
    - "Obol Daily Briefing — Mar 27, 2026"
    - Top 3 crypto prices with 24h change (green/red)
    - Daily verdict banner at bottom
    - Dark background matching app theme
  - 1200×630, same style as `/r/[id]/opengraph-image.tsx`

- [ ] **8b.** Create `src/app/digest/[date]/opengraph-image.tsx`:
  - Same as 8a but fetches by date instead of latest

**Testing:** Visit `/digest/opengraph-image` directly in browser to preview the card.

---

## Step 9: Landing Page Integration

- [ ] **9a.** Add a "Daily Briefing" section to `src/app/page.tsx`:
  - Fetch latest digest server-side via `ReportStore.getLatestDigest()`
  - If digest exists: show a preview card with:
    - Date header
    - Top 3 METRIC markers (price cards)
    - VERDICT text
    - "Read full briefing →" link to `/digest`
  - If no digest: skip section entirely (don't show empty state on landing page)
  - Position: after the research clusters section, before pricing

**Testing:** Visit `/` and verify the digest preview card appears with live data.

---

## Step 10: Cron Config & Deploy

- [ ] **10a.** Update `vercel.json` to add the digest cron:

```json
{
  "crons": [
    { "path": "/api/credits/check-topups", "schedule": "0 0 * * *" },
    { "path": "/api/digest/generate", "schedule": "0 8 * * *" }
  ]
}
```

- [ ] **10b.** Ensure `CRON_SECRET` is set in Vercel env (should already exist from check-topups).

- [ ] **10c.** Deploy and trigger manually once to verify end-to-end: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://obolai.xyz/api/digest/generate`

- [ ] **10d.** Verify the generated digest at `https://obolai.xyz/digest` and the OG card by sharing on X.

---

## Cost Summary

| Source | Calls/day | Cost/call | Daily cost |
|--------|-----------|-----------|------------|
| CoinGecko | 1 | free | $0.00 |
| Dune (whale ×2, CEX ×2, stablecoin ×2) | 6 | $0 cached / ~$0.05 fresh | $0.00–$0.30 |
| GenVox sentiment | 3-4 | $0.03 (cached = $0) | $0.00–$0.12 |
| AI generation | 1 | ~$0.01 | $0.01 |
| **Total** | | | **$0.01–$0.43** |

Best case (all cached): $0.01/day. Worst case (all fresh): $0.43/day.

---

## Dependencies Between Steps

```
Step 1 (types + tokens)
  ↓
Step 2 (reducers) → Step 3 (collector) → Step 4 (generator) → Step 6 (cron endpoint)
                      ↓                    ↓
                    Step 5 (store)       Step 4a (extract shared utils)
                      ↓
                    Step 7 (pages) → Step 8 (OG images) → Step 9 (landing page) → Step 10 (deploy)
```

Steps 1-2 have no external deps, can be built and unit tested in isolation.
Step 5 (store update) is a one-liner, can be done anytime.
Steps 7-8 can be built in parallel once step 6 produces a real digest in the DB.
