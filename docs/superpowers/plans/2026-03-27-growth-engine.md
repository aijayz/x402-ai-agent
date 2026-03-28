# Growth Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 3 features + 1 enhancement that create an automated growth flywheel for Obol AI (~$0.65/day, ~$20/month).

**Architecture:** Extend the existing digest cron to generate smart Twitter posts and token snapshots. Add a new Telegram group bot webhook. All features reuse existing data sources (CoinGecko, Dune, GenVox, QuantumShield) and infrastructure (Neon Postgres, Upstash Redis).

**Tech Stack:** Next.js App Router, twitter-api-v2, Telegram Bot API, Satori OG images, Neon Postgres, Upstash Redis, @t3-oss/env-nextjs

**Spec:** `docs/superpowers/specs/2026-03-27-growth-engine-design.md`

---

## File Map

### Feature 1: Smart Twitter Posts
- Modify: `src/lib/env.ts` — add `TWITTER_THREAD_MODE`
- Modify: `src/lib/twitter.ts` — add `postThread()`
- Create: `src/lib/digest/tweet-formatter.ts` — template-driven tweet formatter
- Modify: `src/app/api/digest/generate/route.ts` — fix hardcoded domain, use new formatter

### Feature 2: Token SEO Pages
- Create: `src/lib/token-pages/store.ts` — `TokenSnapshotStore` CRUD
- Create: `src/lib/token-pages/generator.ts` — multi-source data assembler
- Create: `src/app/token/[symbol]/page.tsx` — ISR token page
- Create: `src/app/token/[symbol]/opengraph-image.tsx` — Satori OG card
- Create: `src/app/token/[symbol]/twitter-image.tsx` — re-export from OG
- Create: `src/app/token/[symbol]/not-found.tsx` — 404 page
- Create: `src/app/sitemap.ts` — dynamic sitemap
- Modify: `src/app/api/digest/generate/route.ts` — trigger token snapshot generation
- Modify: `src/middleware.ts` — add `/sitemap.xml` to matcher exclusion if needed

### Feature 3: Telegram Community Bot
- Modify: `src/lib/env.ts` — add `TELEGRAM_GROUP_BOT_TOKEN`, `TELEGRAM_BOT_WEBHOOK_SECRET`
- Create: `src/lib/telegram-bot/rate-limit.ts` — per-group Redis rate limiting
- Create: `src/lib/telegram-bot/data.ts` — data layer over existing services
- Create: `src/lib/telegram-bot/responses.ts` — branded response formatter
- Create: `src/lib/telegram-bot/commands.ts` — command parser and router
- Create: `src/app/api/telegram/bot/route.ts` — webhook handler

### Enhancement: Widen Share Eligibility
- Modify: `src/components/ai-elements/message-actions.tsx` — relax gate condition

---

## Task 0: Widen Share Eligibility (Enhancement)

**Files:**
- Modify: `src/components/ai-elements/message-actions.tsx:55`

- [ ] **Step 1: Relax the share gate condition**

In `src/components/ai-elements/message-actions.tsx`, change line 55 from:
```tsx
if (totalCost === 0 && !hasMarkers) return null;
```
to:
```tsx
if (totalCost === 0 && !hasMarkers && textContent.length < 200) return null;
```

- [ ] **Step 2: Verify the change**

Run: `pnpm typecheck`
Expected: No type errors.

Manually test: open `/chat`, ask a question that doesn't trigger paid tools (e.g., "What is x402?"). The response should be >200 chars and show a Share button.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-elements/message-actions.tsx
git commit -m "feat: widen share eligibility to any response >200 chars"
```

---

## Task 1: Fix Hardcoded Domain in Digest Cron

**Files:**
- Modify: `src/app/api/digest/generate/route.ts:60`

- [ ] **Step 1: Replace hardcoded URL**

In `src/app/api/digest/generate/route.ts`, line 60, change:
```ts
const digestUrl = `https://obolai.app/digest/${today}`;
```
to:
```ts
const digestUrl = `${env.URL}/digest/${today}`;
```

`env.URL` is already defined in `src/lib/env.ts` and set to the production domain.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors. `env.URL` is a required env var, already set.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/digest/generate/route.ts
git commit -m "fix: use env.URL instead of hardcoded obolai.app in digest cron"
```

---

## Task 2: Add TWITTER_THREAD_MODE Env Var

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add TWITTER_THREAD_MODE to env schema**

In `src/lib/env.ts`, add to the `server` section (alongside the existing TWITTER vars around line 40-45):
```ts
TWITTER_THREAD_MODE: z.enum(["single", "pair", "thread"]).optional().default("single"),
```

And add to the `runtimeEnv` section:
```ts
TWITTER_THREAD_MODE: process.env.TWITTER_THREAD_MODE,
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors. The default is `"single"` so it works even without setting the env var.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat: add TWITTER_THREAD_MODE env var (single/pair/thread)"
```

---

## Task 3: Add postThread to twitter.ts

**Files:**
- Modify: `src/lib/twitter.ts`

- [ ] **Step 1: Add postThread function**

Add below the existing `postTweet` function in `src/lib/twitter.ts`:

```ts
/**
 * Post a thread (reply chain). Handles 1+ tweets.
 * Returns the ID of the first tweet, or null if posting is disabled.
 */
export async function postThread(tweets: string[]): Promise<string | null> {
  if (
    !env.TWITTER_API_KEY ||
    !env.TWITTER_API_SECRET ||
    !env.TWITTER_ACCESS_TOKEN ||
    !env.TWITTER_ACCESS_SECRET ||
    tweets.length === 0
  ) {
    return null;
  }

  try {
    const client = new TwitterApi({
      appKey: env.TWITTER_API_KEY,
      appSecret: env.TWITTER_API_SECRET,
      accessToken: env.TWITTER_ACCESS_TOKEN,
      accessSecret: env.TWITTER_ACCESS_SECRET,
    });

    // Post first tweet
    const first = await client.v2.tweet(tweets[0]);
    const firstId = first.data.id;
    console.log(`[TWITTER] Posted thread start ${firstId}`);

    // Post replies
    let lastId = firstId;
    for (let i = 1; i < tweets.length; i++) {
      const reply = await client.v2.tweet(tweets[i], {
        reply: { in_reply_to_tweet_id: lastId },
      });
      lastId = reply.data.id;
      console.log(`[TWITTER] Posted thread reply ${i}/${tweets.length - 1}: ${lastId}`);
    }

    return firstId;
  } catch (err) {
    console.error("[TWITTER] Failed to post thread", err);
    return null;
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors. Check that `twitter-api-v2` types support the `reply` parameter on `client.v2.tweet()`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/twitter.ts
git commit -m "feat: add postThread() for multi-tweet reply chains"
```

---

## Task 4: Create Tweet Formatter

**Files:**
- Create: `src/lib/digest/tweet-formatter.ts`

- [ ] **Step 1: Create the tweet formatter**

Create `src/lib/digest/tweet-formatter.ts`:

```ts
import { env } from "@/lib/env";
import type { DigestData } from "./types";

/** Format a price line for tweet display */
function fmtPrice(p: { symbol: string; price: number; change24h: number }): string {
  const sign = p.change24h >= 0 ? "+" : "";
  const price = p.price >= 1
    ? p.price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : `$${p.price.toPrecision(3)}`;
  return `${p.symbol.padEnd(8)} ${price.padStart(10)}   ${sign}${p.change24h.toFixed(1)}%`;
}

/** Pick the most dramatic data block for pair mode */
function pickStrongestBlock(data: DigestData): string | null {
  // Whale flows with large net movement
  const bigWhale = data.whaleFlows.find((w) => Math.abs(w.netFlowUsd) > 10_000_000);
  if (bigWhale) {
    const dir = bigWhale.netFlowUsd > 0 ? "inflow" : "outflow";
    const amt = `$${Math.abs(bigWhale.netFlowUsd / 1e6).toFixed(0)}M`;
    return `Whale watch\n\n-> ${amt} ${bigWhale.token} net ${dir} (7d)`;
  }

  // Sentiment with extreme readings
  const extreme = data.sentiment.find((s) => s.score !== null && (s.score > 75 || s.score < 30));
  if (extreme) {
    const bar = (score: number) => {
      const filled = Math.round(score / 10);
      return "|".repeat(filled) + ".".repeat(10 - filled);
    };
    return `Sentiment\n\n${extreme.token}  ${bar(extreme.score!)}  ${extreme.score} -- ${extreme.label}`;
  }

  // Default: price table
  return null;
}

/** Build a price table block from digest data */
function priceBlock(data: DigestData): string {
  const sorted = [...data.prices].sort((a, b) => b.change24h - a.change24h);
  const lines = sorted.slice(0, 6).map(fmtPrice);
  return `Top movers today\n\n${lines.join("\n")}`;
}

/**
 * Format digest data into tweet(s) based on TWITTER_THREAD_MODE.
 * Returns an array of tweet strings (length 1 for single, 2 for pair, 4-5 for thread).
 */
export function formatDigestTweets(data: DigestData, date: string, digestContent: string): string[] {
  const mode = env.TWITTER_THREAD_MODE ?? "single";
  const digestUrl = `${env.URL}/digest/${date}`;

  // Extract verdict from digest content
  const verdictMatch = digestContent.match(/\[VERDICT:([^|]+)\|(\w+)]/);
  const verdict = verdictMatch ? verdictMatch[1].trim() : "";

  // Find biggest movers for hook
  const sorted = [...data.prices].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
  const top3 = sorted.slice(0, 3);

  const hookLines = top3.map((p) => {
    const sign = p.change24h >= 0 ? "+" : "";
    return `${p.symbol} ${sign}${p.change24h.toFixed(1)}%`;
  });

  if (mode === "single") {
    const parts = [
      `${date} -- On-Chain Brief`,
      "",
      ...hookLines,
      "",
      verdict || undefined,
      "",
      `Full daily brief -> ${digestUrl}`,
    ].filter(Boolean) as string[];

    return [parts.join("\n")];
  }

  if (mode === "pair") {
    const hook = [
      `${date} -- On-Chain Brief`,
      "",
      ...hookLines,
      "",
      verdict || undefined,
      "",
      `Full brief -> ${digestUrl}`,
    ].filter(Boolean) as string[];

    const secondBlock = pickStrongestBlock(data) ?? priceBlock(data);
    const second = [secondBlock, "", `Ask Obol anything -> ${env.URL}/chat`].join("\n");

    return [hook.join("\n"), second];
  }

  // thread mode
  const tweet1 = [
    `${date} -- Daily On-Chain Brief`,
    "",
    ...hookLines.map((l) => `${l}`),
    "",
    "Full thread ->",
  ].join("\n");

  const tweet2 = priceBlock(data);

  // Whale tweet
  const whaleLines = data.whaleFlows.slice(0, 3).map((w) => {
    const dir = w.netFlowUsd > 0 ? "inflow" : "outflow";
    const amt = `$${Math.abs(w.netFlowUsd / 1e6).toFixed(0)}M`;
    return `-> ${amt} ${w.token} net ${dir}`;
  });
  const tweet3 = whaleLines.length > 0
    ? `Whale watch\n\n${whaleLines.join("\n")}`
    : null;

  // Sentiment tweet
  const sentimentLines = data.sentiment
    .filter((s) => s.score !== null)
    .slice(0, 3)
    .map((s) => {
      const filled = Math.round((s.score ?? 0) / 10);
      const bar = "|".repeat(filled) + ".".repeat(10 - filled);
      return `${s.token.padEnd(5)} ${bar}  ${s.score} -- ${s.label}`;
    });
  const tweet4 = sentimentLines.length > 0
    ? `Sentiment snapshot\n\n${sentimentLines.join("\n")}`
    : null;

  const tweetCta = [
    `Full briefing with sources`,
    `-> ${digestUrl}`,
    "",
    `Or ask Obol anything on-chain`,
    `-> ${env.URL}/chat`,
  ].join("\n");

  return [tweet1, tweet2, tweet3, tweet4, tweetCta].filter(Boolean) as string[];
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/digest/tweet-formatter.ts
git commit -m "feat: add template-driven tweet formatter for digest posts"
```

---

## Task 5: Wire Tweet Formatter into Digest Cron

**Files:**
- Modify: `src/app/api/digest/generate/route.ts`

- [ ] **Step 1: Replace inline tweet formatting with new formatter**

In `src/app/api/digest/generate/route.ts`:

1. Add import at top:
```ts
import { formatDigestTweets } from "@/lib/digest/tweet-formatter";
import { postThread } from "@/lib/twitter";
```

2. Remove the `postTweet` import (line 7):
```ts
// DELETE: import { postTweet } from "@/lib/twitter";
```

3. Replace the entire Twitter section (lines 106-127, from `// ── X / Twitter ──` through `await postTweet(tweetText).catch(...)`) with:
```ts
    // ── X / Twitter ──
    const tweets = formatDigestTweets(data, today, content);
    await postThread(tweets).catch((err) => {
      console.error("[DIGEST] Twitter share failed:", err);
    });
```

4. Also fix the Telegram section to use `digestUrl` from `env.URL` (already done in Task 1 — the `digestUrl` variable on line 60 was fixed there). The inline `fmt`, `top6`, `coinGlyph`, `glyph`, `displayDate`, `xPrices`, and `tweetText` variables (lines 64-123) can all be removed — they're replaced by the formatter. Keep the Telegram section as-is since it has its own formatting.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors. The digest cron now uses `formatDigestTweets` + `postThread` instead of inline formatting + `postTweet`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/digest/generate/route.ts
git commit -m "feat: wire tweet formatter into digest cron, remove inline tweet building"
```

---

## Task 6: Token Snapshot Store + DB Migration

**Files:**
- Create: `src/lib/token-pages/store.ts`

- [ ] **Step 1: Create the token_snapshots table**

Run this SQL against the production Neon database:

```sql
CREATE TABLE IF NOT EXISTS token_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  digest_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_snapshots_symbol ON token_snapshots (symbol);
CREATE INDEX IF NOT EXISTS idx_token_snapshots_date ON token_snapshots (digest_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_snapshots_symbol_date ON token_snapshots (symbol, digest_date);
```

- [ ] **Step 2: Create TokenSnapshotStore**

Create `src/lib/token-pages/store.ts`:

```ts
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

export interface TokenSnapshot {
  id: string;
  symbol: string;
  data: TokenSnapshotData;
  digestDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenSnapshotData {
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  iconUrl?: string;
  security?: { score: number; details?: string } | null;
  whaleFlow?: { netFlowUsd: number; largeTxCount: number } | null;
  cexFlow?: { netFlowUsd: number; direction: string } | null;
  sentiment?: { score: number | null; label: string | null; summary: string | null } | null;
  unlocks?: { nextUnlockDate?: string; nextUnlockPercent?: number } | null;
  intelligence?: string[];
}

function mapRow(row: Record<string, unknown>): TokenSnapshot {
  const dd = row.digest_date;
  let digestDate: string;
  if (dd instanceof Date) {
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    const d = String(dd.getDate()).padStart(2, "0");
    digestDate = `${y}-${m}-${d}`;
  } else {
    digestDate = String(dd).slice(0, 10);
  }

  return {
    id: String(row.id),
    symbol: String(row.symbol),
    data: row.data as TokenSnapshotData,
    digestDate,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const sql = () => neon(env.DATABASE_URL);

export const TokenSnapshotStore = {
  /** Upsert a snapshot for a symbol+date (idempotent). */
  async upsert(symbol: string, date: string, data: TokenSnapshotData): Promise<TokenSnapshot> {
    const rows = await sql()`
      INSERT INTO token_snapshots (symbol, data, digest_date)
      VALUES (${symbol.toUpperCase()}, ${JSON.stringify(data)}, ${date})
      ON CONFLICT (symbol, digest_date) DO UPDATE
        SET data = EXCLUDED.data, updated_at = now()
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  /** Get the latest snapshot for a symbol. */
  async getBySymbol(symbol: string): Promise<TokenSnapshot | null> {
    const rows = await sql()`
      SELECT * FROM token_snapshots
      WHERE symbol = ${symbol.toUpperCase()}
      ORDER BY digest_date DESC
      LIMIT 1
    `;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  /** Get all distinct symbols that have snapshots. */
  async getAllSymbols(): Promise<string[]> {
    const rows = await sql()`
      SELECT DISTINCT symbol FROM token_snapshots ORDER BY symbol
    `;
    return rows.map((r) => String(r.symbol));
  },
};
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/token-pages/store.ts
git commit -m "feat: add TokenSnapshotStore with upsert, getBySymbol, getAllSymbols"
```

---

## Task 7: Token Page Data Generator

**Files:**
- Create: `src/lib/token-pages/generator.ts`

- [ ] **Step 1: Create the generator**

Create `src/lib/token-pages/generator.ts`. This assembles data from multiple sources for a given token and upserts into the store.

```ts
import { TokenSnapshotStore, type TokenSnapshotData } from "./store";
import type { DigestData, TokenPrice } from "@/lib/digest/types";
import { queryDune } from "@/lib/services/dune";
import { env } from "@/lib/env";

/** CoinGecko IDs for the 4 extra fixed tokens (beyond digest's 6) */
const EXTRA_FIXED: Record<string, string> = {
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  POL: "matic-network",
};

/** All 10 fixed token symbols */
export const FIXED_TOKEN_SYMBOLS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA",
  "DOGE", "AVAX", "LINK", "POL",
];

/** Fetch top losers from CoinGecko (top 100 sorted by worst 24h change) */
async function fetchTopLosers(count: number): Promise<TokenPrice[]> {
  const base = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";
  try {
    const res = await fetch(
      `${base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const coins = (await res.json()) as Array<Record<string, unknown>>;
    return coins
      .filter((c) => typeof c.price_change_percentage_24h === "number" && c.price_change_percentage_24h < 0)
      .sort((a, b) => (a.price_change_percentage_24h as number) - (b.price_change_percentage_24h as number))
      .slice(0, count)
      .map((c) => ({
        symbol: String(c.symbol).toUpperCase(),
        name: String(c.name),
        price: Number(c.current_price) || 0,
        change24h: Number(c.price_change_percentage_24h) || 0,
        marketCap: Number(c.market_cap) || 0,
        volume24h: Number(c.total_volume) || 0,
        isFixed: false,
        iconUrl: c.image ? String(c.image) : undefined,
      }));
  } catch {
    console.warn("[TOKEN-PAGES] Failed to fetch top losers");
    return [];
  }
}

/** Fetch extra fixed tokens not in the digest (DOGE, AVAX, LINK, POL) */
async function fetchExtraFixed(): Promise<TokenPrice[]> {
  const ids = Object.values(EXTRA_FIXED).join(",");
  const base = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";
  try {
    const res = await fetch(
      `${base}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const coins = (await res.json()) as Array<Record<string, unknown>>;
    return coins.map((c) => ({
      symbol: String(c.symbol).toUpperCase(),
      name: String(c.name),
      price: Number(c.current_price) || 0,
      change24h: Number(c.price_change_percentage_24h) || 0,
      marketCap: Number(c.market_cap) || 0,
      volume24h: Number(c.total_volume) || 0,
      isFixed: true,
      iconUrl: c.image ? String(c.image) : undefined,
    }));
  } catch {
    console.warn("[TOKEN-PAGES] Failed to fetch extra fixed tokens");
    return [];
  }
}

/** Build snapshot data for a single token price entry using digest data */
function buildSnapshotData(
  price: TokenPrice,
  digestData: DigestData,
): TokenSnapshotData {
  const sym = price.symbol.toUpperCase();
  const whale = digestData.whaleFlows.find((w) => w.token.toUpperCase() === sym) ?? null;
  const cex = digestData.cexFlows.find((c) => c.token.toUpperCase() === sym) ?? null;
  const sent = digestData.sentiment.find((s) => s.token.toUpperCase() === sym) ?? null;

  return {
    name: price.name,
    price: price.price,
    change24h: price.change24h,
    marketCap: price.marketCap,
    iconUrl: price.iconUrl,
    whaleFlow: whale ? { netFlowUsd: whale.netFlowUsd, largeTxCount: whale.largeTxCount } : null,
    cexFlow: cex ? { netFlowUsd: cex.netFlowUsd, direction: cex.direction } : null,
    sentiment: sent ? { score: sent.score, label: sent.label, summary: sent.summary } : null,
    security: null, // Intentionally deferred — QuantumShield calls add latency + cost per token. Will add in a follow-up when token pages prove traction.
    unlocks: null,
    intelligence: [],
  };
}

/**
 * Generate token snapshots from digest data.
 * Called after digest generation — uses the already-fetched digest data
 * plus fetches extra fixed tokens and top losers independently.
 */
export async function generateTokenSnapshots(
  digestData: DigestData,
  date: string,
): Promise<number> {
  // Merge all token prices: digest tokens + extra fixed + top losers
  const [extraFixed, topLosers] = await Promise.all([
    fetchExtraFixed(),
    fetchTopLosers(3),
  ]);

  // Deduplicate by symbol (digest tokens take priority)
  const seen = new Set<string>();
  const allPrices: TokenPrice[] = [];

  for (const p of digestData.prices) {
    const sym = p.symbol.toUpperCase();
    if (!seen.has(sym)) {
      seen.add(sym);
      allPrices.push(p);
    }
  }
  for (const p of [...extraFixed, ...topLosers]) {
    const sym = p.symbol.toUpperCase();
    if (!seen.has(sym)) {
      seen.add(sym);
      allPrices.push(p);
    }
  }

  // Generate and upsert snapshots
  let count = 0;
  for (const price of allPrices) {
    try {
      const data = buildSnapshotData(price, digestData);
      await TokenSnapshotStore.upsert(price.symbol, date, data);
      count++;
    } catch (err) {
      console.error(`[TOKEN-PAGES] Failed to upsert ${price.symbol}:`, err);
    }
  }

  console.log(`[TOKEN-PAGES] Generated ${count} token snapshots for ${date}`);
  return count;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/token-pages/generator.ts
git commit -m "feat: add token page data generator with extra fixed + top losers"
```

---

## Task 8: Wire Token Generation into Digest Cron

**Files:**
- Modify: `src/app/api/digest/generate/route.ts`

- [ ] **Step 1: Add token snapshot generation after digest save**

In `src/app/api/digest/generate/route.ts`, add import at top:
```ts
import { generateTokenSnapshots } from "@/lib/token-pages/generator";
```

After the Twitter section (after `await postThread(tweets).catch(...)`) and before the `return NextResponse.json(...)`, add:
```ts
    // ── Token SEO pages ──
    await generateTokenSnapshots(data, today).catch((err) => {
      console.error("[DIGEST] Token snapshot generation failed:", err);
    });
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/digest/generate/route.ts
git commit -m "feat: trigger token snapshot generation from digest cron"
```

---

## Task 9: Token Page (Next.js)

**Files:**
- Create: `src/app/token/[symbol]/page.tsx`
- Create: `src/app/token/[symbol]/not-found.tsx`

- [ ] **Step 1: Create the not-found page**

Create `src/app/token/[symbol]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function TokenNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Token Not Found</h1>
        <p className="text-muted-foreground">
          We don&apos;t have data for this token yet. Try one of our tracked tokens.
        </p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
            bg-gradient-to-r from-blue-500/20 to-cyan-400/20
            border border-blue-500/30 hover:border-blue-500/50
            text-foreground hover:from-blue-500/30 hover:to-cyan-400/30
            transition-all duration-200"
        >
          Ask Obol AI instead
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the token page**

Create `src/app/token/[symbol]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import type { Metadata } from "next";

export const revalidate = 86400; // ISR: revalidate once per day

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());
  if (!snap) return { title: "Token Not Found -- Obol AI" };

  const d = snap.data;
  const title = `${d.name} (${snap.symbol}) On-Chain Intelligence -- Obol AI`;
  const description = `${snap.symbol} at $${d.price.toLocaleString()} (${d.change24h >= 0 ? "+" : ""}${d.change24h.toFixed(1)}%). Whale flows, security score, sentiment analysis. Updated daily.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "article", siteName: "Obol AI" },
    twitter: { card: "summary_large_image", title },
  };
}

function ScoreCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-muted/20 p-4 space-y-1`}>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export default async function TokenPage({ params }: Props) {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());
  if (!snap) notFound();

  const d = snap.data;
  const changeColor = d.change24h >= 0 ? "text-green-400" : "text-red-400";
  const changeSign = d.change24h >= 0 ? "+" : "";
  const priceStr = d.price >= 1
    ? d.price.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : `$${d.price.toPrecision(4)}`;
  const mcapStr = d.marketCap > 0
    ? `$${(d.marketCap / 1e9).toFixed(1)}B`
    : "N/A";

  // Score cards
  const securityScore = d.security?.score;
  const whaleNet = d.whaleFlow?.netFlowUsd;
  const sentimentScore = d.sentiment?.score;

  const updatedDate = new Date(snap.updatedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[680px] mx-auto px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors">
            <svg width="20" height="20" viewBox="0 0 32 32">
              <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
              <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#g)" strokeWidth="3.5" />
              <line x1="4" y1="16" x2="28" y2="16" stroke="url(#g)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Obol AI
          </a>
        </div>
      </header>

      <main className="max-w-[680px] mx-auto px-6 pt-10 pb-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {d.iconUrl && (
              <img src={d.iconUrl} alt={snap.symbol} width={32} height={32} className="rounded-full" />
            )}
            <h1 className="text-2xl font-semibold">{d.name} ({snap.symbol})</h1>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{priceStr}</span>
            <span className={`text-lg font-medium ${changeColor}`}>
              {changeSign}{d.change24h.toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground">MCap: {mcapStr}</span>
          </div>
        </div>

        {/* Score cards */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          <ScoreCard
            label="Security"
            value={securityScore != null ? `${securityScore}/100` : "N/A"}
            sub={securityScore != null ? (securityScore >= 70 ? "Verified" : "Review") : "Pending"}
            color={securityScore != null ? (securityScore >= 70 ? "text-green-400" : "text-amber-400") : "text-muted-foreground"}
          />
          <ScoreCard
            label="Whale Flow (7d)"
            value={whaleNet != null ? `$${(Math.abs(whaleNet) / 1e6).toFixed(1)}M` : "N/A"}
            sub={whaleNet != null ? (whaleNet >= 0 ? "Net inflow" : "Net outflow") : "No data"}
            color={whaleNet != null ? (whaleNet >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground"}
          />
          <ScoreCard
            label="Sentiment"
            value={sentimentScore != null ? `${sentimentScore}/100` : "N/A"}
            sub={d.sentiment?.label ?? "No data"}
            color={sentimentScore != null ? (sentimentScore >= 60 ? "text-green-400" : sentimentScore >= 40 ? "text-amber-400" : "text-red-400") : "text-muted-foreground"}
          />
        </div>

        {/* Intelligence bullets */}
        {d.intelligence && d.intelligence.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Intelligence</h2>
            <ul className="space-y-2">
              {d.intelligence.map((item, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 text-center space-y-3">
          <p className="text-sm text-foreground/80">Want deeper analysis?</p>
          <Link
            href={`/chat?q=Tell me about ${snap.symbol}`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
              bg-gradient-to-r from-blue-500/20 to-cyan-400/20
              border border-blue-500/30 hover:border-blue-500/50
              text-foreground hover:from-blue-500/30 hover:to-cyan-400/30
              transition-all duration-200"
          >
            Ask Obol about {snap.symbol}
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-border/40 text-center">
          <p className="text-xs text-muted-foreground">
            Last updated {updatedDate} | Data via x402 paid intelligence network
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/token/
git commit -m "feat: add /token/[symbol] SEO page with ISR"
```

---

## Task 10: Token Page OG Image

**Files:**
- Create: `src/app/token/[symbol]/opengraph-image.tsx`
- Create: `src/app/token/[symbol]/twitter-image.tsx`

- [ ] **Step 1: Create the OG image**

Create `src/app/token/[symbol]/opengraph-image.tsx`. Follow the same Satori patterns from `src/app/r/[id]/opengraph-image.tsx` (edge runtime, inline styles, `display: "flex"` everywhere).

```tsx
import { ImageResponse } from "next/og";
import { TokenSnapshotStore } from "@/lib/token-pages/store";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Obol AI Token Intelligence";

export default async function OgImage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase());

  if (!snap) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#0a0a0a", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
          Token not found
        </div>
      ),
      { ...size }
    );
  }

  const d = snap.data;
  const changeSign = d.change24h >= 0 ? "+" : "";
  const changeColor = d.change24h >= 0 ? "#4ade80" : "#f87171";
  const priceStr = d.price >= 1
    ? `$${d.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${d.price.toPrecision(3)}`;

  const cards: Array<{ label: string; value: string; color: string }> = [];
  if (d.security?.score != null) cards.push({ label: "Security", value: `${d.security.score}/100`, color: d.security.score >= 70 ? "#4ade80" : "#fbbf24" });
  if (d.whaleFlow) cards.push({ label: "Whale Flow", value: `$${(Math.abs(d.whaleFlow.netFlowUsd) / 1e6).toFixed(0)}M`, color: d.whaleFlow.netFlowUsd >= 0 ? "#4ade80" : "#f87171" });
  if (d.sentiment?.score != null) cards.push({ label: "Sentiment", value: `${d.sentiment.score}/100`, color: d.sentiment.score >= 60 ? "#4ade80" : d.sentiment.score >= 40 ? "#fbbf24" : "#f87171" });

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0a0a0a", color: "#e5e5e5", padding: "60px 80px", fontFamily: "sans-serif" }}>
        {/* Token header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#ffffff" }}>{d.name} ({snap.symbol})</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "48px" }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: "#ffffff" }}>{priceStr}</span>
          <span style={{ fontSize: 32, fontWeight: 600, color: changeColor }}>{changeSign}{d.change24h.toFixed(1)}%</span>
        </div>
        {/* Score cards */}
        <div style={{ display: "flex", gap: "24px", marginBottom: "auto" }}>
          {cards.map((c, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", padding: "24px 32px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", minWidth: "200px" }}>
              <span style={{ fontSize: 16, color: "#a3a3a3", marginBottom: "8px" }}>{c.label}</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: c.color }}>{c.value}</span>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 20, color: "#525252" }}>obolai.xyz/token/{snap.symbol}</span>
          <span style={{ fontSize: 20, color: "#525252" }}>Powered by x402</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Create twitter-image.tsx re-export**

Create `src/app/token/[symbol]/twitter-image.tsx`:

```tsx
export { default, size, contentType } from "./opengraph-image";
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/token/
git commit -m "feat: add Satori OG + Twitter images for token pages"
```

---

## Task 11: Dynamic Sitemap

**Files:**
- Create: `src/app/sitemap.ts`

- [ ] **Step 1: Create the sitemap**

Create `src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import { env } from "@/lib/env";

const BASE_URL = env.URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/chat`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/digest`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  let tokenPages: MetadataRoute.Sitemap = [];
  try {
    const symbols = await TokenSnapshotStore.getAllSymbols();
    tokenPages = symbols.map((symbol) => ({
      url: `${BASE_URL}/token/${symbol}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("[SITEMAP] Failed to fetch token symbols:", err);
  }

  return [...staticPages, ...tokenPages];
}
```

- [ ] **Step 2: Verify sitemap.xml is excluded from middleware**

Check `src/middleware.ts` config.matcher. The existing matcher already excludes `sitemap.xml` (confirmed in exploration). No change needed.

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/sitemap.ts
git commit -m "feat: add dynamic sitemap with token pages"
```

---

## Task 12: Telegram Bot — Env Vars

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add Telegram group bot env vars**

In `src/lib/env.ts`, add to the `server` section:
```ts
TELEGRAM_GROUP_BOT_TOKEN: z.string().optional(),
TELEGRAM_BOT_WEBHOOK_SECRET: z.string().optional(),
```

And add to the `runtimeEnv` section:
```ts
TELEGRAM_GROUP_BOT_TOKEN: process.env.TELEGRAM_GROUP_BOT_TOKEN,
TELEGRAM_BOT_WEBHOOK_SECRET: process.env.TELEGRAM_BOT_WEBHOOK_SECRET,
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat: add TELEGRAM_GROUP_BOT_TOKEN and TELEGRAM_BOT_WEBHOOK_SECRET env vars"
```

---

## Task 13: Telegram Bot — Rate Limiter

**Files:**
- Create: `src/lib/telegram-bot/rate-limit.ts`

- [ ] **Step 1: Create per-group rate limiter**

Create `src/lib/telegram-bot/rate-limit.ts`:

```ts
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  return redis;
}

type CommandType = "free" | "safe" | "mention";

const LIMITS: Record<CommandType, { max: number; windowSec: number }> = {
  free:    { max: 10, windowSec: 3600 },      // 10/hour per group
  safe:    { max: 5,  windowSec: 3600 },       // 5/hour per group
  mention: { max: 3,  windowSec: 86400 },      // 3/day per group
};

/**
 * Check if a command is allowed for this group. Returns true if allowed.
 * Fail-open: if Redis is unavailable, always allows.
 */
export async function checkGroupLimit(groupId: string | number, type: CommandType): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;

  const limit = LIMITS[type];
  const key = `tgbot:${type}:${groupId}`;

  try {
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, limit.windowSec);
    }
    return count <= limit.max;
  } catch (err) {
    console.error("[TG-BOT] Rate limit check failed:", err);
    return true; // fail-open
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram-bot/rate-limit.ts
git commit -m "feat: add per-group Redis rate limiter for Telegram bot"
```

---

## Task 14: Telegram Bot — Data Layer

**Files:**
- Create: `src/lib/telegram-bot/data.ts`

- [ ] **Step 1: Create data layer over existing services**

Create `src/lib/telegram-bot/data.ts`:

```ts
import { env } from "@/lib/env";
import { TokenSnapshotStore, type TokenSnapshotData } from "@/lib/token-pages/store";
import { ReportStore } from "@/lib/reports/report-store";

const COINGECKO_BASE = env.COINGECKO_URL ?? "https://api.coingecko.com/api/v3";

/** Get live price from CoinGecko (with fallback to token snapshot) */
export async function getPrice(symbol: string): Promise<{
  symbol: string; name: string; price: number; change24h: number; marketCap: number;
} | null> {
  // Try token snapshot first (cached, free)
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase()).catch(() => null);
  if (snap) {
    return {
      symbol: snap.symbol,
      name: snap.data.name,
      price: snap.data.price,
      change24h: snap.data.change24h,
      marketCap: snap.data.marketCap,
    };
  }

  // Fallback: CoinGecko simple price
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const key = Object.keys(data)[0];
    if (!key) return null;
    const coin = data[key];
    return {
      symbol: symbol.toUpperCase(),
      name: key,
      price: coin.usd ?? 0,
      change24h: coin.usd_24h_change ?? 0,
      marketCap: coin.usd_market_cap ?? 0,
    };
  } catch {
    return null;
  }
}

/** Get whale flow data from token snapshot */
export async function getWhaleData(symbol: string): Promise<TokenSnapshotData["whaleFlow"]> {
  const snap = await TokenSnapshotStore.getBySymbol(symbol.toUpperCase()).catch(() => null);
  return snap?.data.whaleFlow ?? null;
}

/** Get security score from QuantumShield (subsidized, ~$0.001) */
export async function getSecurity(symbol: string): Promise<{
  score: number; details?: string;
} | null> {
  const qsUrl = env.QUANTUM_SHIELD_URL ?? "https://quantumshield-api.vercel.app";
  try {
    const res = await fetch(
      `${qsUrl}/api/token/security?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      score: Number(data.score ?? data.securityScore ?? 0),
      details: data.summary ?? data.details ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Get today's alpha (top mover from latest digest) */
export async function getAlpha(): Promise<string | null> {
  try {
    const digest = await ReportStore.getLatestDigest();
    if (!digest) return null;
    const verdictMatch = digest.content.match(/\[VERDICT:([^|]+)\|(\w+)]/);
    return verdictMatch ? verdictMatch[1].trim() : digest.title;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram-bot/data.ts
git commit -m "feat: add Telegram bot data layer over existing services"
```

---

## Task 15: Telegram Bot — Response Formatter

**Files:**
- Create: `src/lib/telegram-bot/responses.ts`

- [ ] **Step 1: Create response formatter**

Create `src/lib/telegram-bot/responses.ts`:

```ts
import { env } from "@/lib/env";

const BASE_URL = env.URL || "https://obolai.xyz";

/** Standard branded footer appended to every response */
function footer(symbol?: string): string {
  const lines = [];
  if (symbol) {
    lines.push(`Deep analysis -> ${BASE_URL}/token/${symbol}`);
  }
  lines.push(`Ask more -> ${BASE_URL}/chat`);
  lines.push(`---`);
  lines.push(`Powered by Obol AI | x402 intelligence`);
  return lines.join("\n");
}

export function formatPrice(data: {
  symbol: string; name: string; price: number; change24h: number; marketCap: number;
}): string {
  const sign = data.change24h >= 0 ? "+" : "";
  const price = data.price >= 1
    ? data.price.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : `$${data.price.toPrecision(3)}`;
  const mcap = data.marketCap > 0 ? `$${(data.marketCap / 1e9).toFixed(1)}B` : "N/A";

  return [
    `${data.name} (${data.symbol})`,
    "",
    `Price: ${price}`,
    `24h: ${sign}${data.change24h.toFixed(1)}%`,
    `MCap: ${mcap}`,
    "",
    footer(data.symbol),
  ].join("\n");
}

export function formatSecurity(symbol: string, sec: { score: number; details?: string }): string {
  const verdict = sec.score >= 70 ? "Looks safe" : sec.score >= 40 ? "Moderate risk" : "High risk";
  return [
    `${symbol} Token Security Check`,
    "",
    `Security Score: ${sec.score}/100`,
    `Verdict: ${verdict}`,
    sec.details ? `\n>> ${sec.details}` : "",
    "",
    footer(symbol),
  ].filter(Boolean).join("\n");
}

export function formatWhales(symbol: string, flow: { netFlowUsd: number; largeTxCount: number }): string {
  const dir = flow.netFlowUsd >= 0 ? "inflow" : "outflow";
  const amt = `$${(Math.abs(flow.netFlowUsd) / 1e6).toFixed(1)}M`;

  return [
    `${symbol} Whale Activity (7d)`,
    "",
    `Net flow: ${amt} ${dir}`,
    `Large transactions: ${flow.largeTxCount}`,
    "",
    footer(symbol),
  ].join("\n");
}

export function formatAlpha(text: string): string {
  return [
    `Today's Alpha`,
    "",
    text,
    "",
    `Full briefing -> ${BASE_URL}/digest`,
    `---`,
    `Powered by Obol AI | x402 intelligence`,
  ].join("\n");
}

export function formatRateLimited(): string {
  return [
    `Daily limit reached for this group.`,
    "",
    `For unlimited answers -> ${BASE_URL}/chat`,
  ].join("\n");
}

export function formatError(): string {
  return `Sorry, I couldn't process that request. Try again or visit ${BASE_URL}/chat`;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram-bot/responses.ts
git commit -m "feat: add Telegram bot branded response formatters"
```

---

## Task 16: Telegram Bot — Command Router

**Files:**
- Create: `src/lib/telegram-bot/commands.ts`

- [ ] **Step 1: Create command parser and router**

Create `src/lib/telegram-bot/commands.ts`:

```ts
import { checkGroupLimit } from "./rate-limit";
import { getPrice, getWhaleData, getSecurity, getAlpha } from "./data";
import { formatPrice, formatWhales, formatSecurity, formatAlpha, formatRateLimited, formatError } from "./responses";

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
}

interface CommandResult {
  text: string;
  replyToMessageId: number;
}

/** Extract the command and argument from a message */
function parseCommand(msg: TelegramMessage): { command: string; arg: string } | null {
  if (!msg.text) return null;

  // Check for /command
  const cmdMatch = msg.text.match(/^\/(\w+)(?:@\w+)?\s*(.*)/);
  if (cmdMatch) {
    return { command: cmdMatch[1].toLowerCase(), arg: cmdMatch[2].trim() };
  }

  return null;
}

/** Check if the bot is mentioned in the message */
function isBotMentioned(msg: TelegramMessage, botUsername: string): boolean {
  if (!msg.text || !msg.entities) return false;
  return msg.entities.some(
    (e) => e.type === "mention" && msg.text!.substring(e.offset, e.offset + e.length).toLowerCase() === `@${botUsername.toLowerCase()}`
  );
}

/** Route a message to the appropriate handler. Returns null if the message is not for the bot. */
export async function handleMessage(msg: TelegramMessage, botUsername: string): Promise<CommandResult | null> {
  const chatId = msg.chat.id;

  // Try command first
  const parsed = parseCommand(msg);
  if (parsed) {
    const { command, arg } = parsed;

    switch (command) {
      case "price": {
        if (!arg) return { text: "Usage: /price ETH", replyToMessageId: msg.message_id };
        const allowed = await checkGroupLimit(chatId, "free");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const data = await getPrice(arg);
        if (!data) return { text: `No data found for ${arg.toUpperCase()}`, replyToMessageId: msg.message_id };
        return { text: formatPrice(data), replyToMessageId: msg.message_id };
      }

      case "safe": {
        if (!arg) return { text: "Usage: /safe PEPE", replyToMessageId: msg.message_id };
        const allowed = await checkGroupLimit(chatId, "safe");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const sec = await getSecurity(arg);
        if (!sec) return { text: `No security data for ${arg.toUpperCase()}`, replyToMessageId: msg.message_id };
        return { text: formatSecurity(arg.toUpperCase(), sec), replyToMessageId: msg.message_id };
      }

      case "whales": {
        if (!arg) return { text: "Usage: /whales ETH", replyToMessageId: msg.message_id };
        const allowed = await checkGroupLimit(chatId, "free");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const flow = await getWhaleData(arg);
        if (!flow) return { text: `No whale data for ${arg.toUpperCase()}`, replyToMessageId: msg.message_id };
        return { text: formatWhales(arg.toUpperCase(), flow), replyToMessageId: msg.message_id };
      }

      case "alpha": {
        const allowed = await checkGroupLimit(chatId, "free");
        if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
        const alpha = await getAlpha();
        if (!alpha) return { text: "No digest available today yet.", replyToMessageId: msg.message_id };
        return { text: formatAlpha(alpha), replyToMessageId: msg.message_id };
      }

      case "start":
      case "help": {
        return {
          text: [
            "Obol AI -- On-chain intelligence bot",
            "",
            "/price <token> -- Price + 24h change",
            "/safe <token> -- Quick security score",
            "/whales <token> -- Whale flow summary",
            "/alpha -- Today's top insight",
            "",
            "Or mention me with a question!",
          ].join("\n"),
          replyToMessageId: msg.message_id,
        };
      }

      default:
        return null; // Unknown command, ignore
    }
  }

  // Check for @mention (free-form question)
  if (isBotMentioned(msg, botUsername)) {
    const allowed = await checkGroupLimit(chatId, "mention");
    if (!allowed) return { text: formatRateLimited(), replyToMessageId: msg.message_id };
    // For now, redirect to web — full orchestrator integration is Phase 2
    return {
      text: formatError() + "\n\nFree-form AI answers coming soon!",
      replyToMessageId: msg.message_id,
    };
  }

  return null; // Not for the bot
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram-bot/commands.ts
git commit -m "feat: add Telegram bot command router (price, safe, whales, alpha, help)"
```

---

## Task 17: Telegram Bot — Webhook Handler

**Files:**
- Create: `src/app/api/telegram/bot/route.ts`

- [ ] **Step 1: Create the webhook route**

Create `src/app/api/telegram/bot/route.ts`:

```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleMessage } from "@/lib/telegram-bot/commands";

export const maxDuration = 30;

/** Verify the webhook secret token (Telegram sends it in X-Telegram-Bot-Api-Secret-Token header) */
function verifyWebhook(req: Request): boolean {
  if (!env.TELEGRAM_BOT_WEBHOOK_SECRET) return true; // no secret configured = allow all (dev mode)
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  return token === env.TELEGRAM_BOT_WEBHOOK_SECRET;
}

/** Send a reply via Telegram Bot API */
async function sendReply(chatId: number, text: string, replyToMessageId: number): Promise<void> {
  if (!env.TELEGRAM_GROUP_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_GROUP_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("[TG-BOT] Failed to send reply:", err);
  }
}

export async function POST(req: Request) {
  if (!verifyWebhook(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.TELEGRAM_GROUP_BOT_TOKEN) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const msg = body?.message;
    if (!msg) {
      return NextResponse.json({ ok: true }); // Not a message update, ignore
    }

    // Extract bot username from token (first part before colon is bot ID, but we need the username)
    // For now, use a reasonable default — can be made configurable later
    const botUsername = "obol_ai_bot";

    const result = await handleMessage(msg, botUsername);
    if (result) {
      await sendReply(msg.chat.id, result.text, result.replyToMessageId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[TG-BOT] Webhook error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram to prevent retries
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telegram/bot/route.ts
git commit -m "feat: add Telegram group bot webhook handler"
```

---

## Task 18: Deploy + Set Up Telegram Webhook

This task is manual — not code.

- [ ] **Step 1: Create a Telegram bot via @BotFather**

Message @BotFather on Telegram:
1. `/newbot`
2. Name: `Obol AI Bot`
3. Username: `obol_ai_bot` (or whatever is available)
4. Save the token

- [ ] **Step 2: Set env vars on Vercel**

```bash
vercel env add TELEGRAM_GROUP_BOT_TOKEN    # paste the token from BotFather
vercel env add TELEGRAM_BOT_WEBHOOK_SECRET # generate a random string: openssl rand -hex 32
```

- [ ] **Step 3: Deploy**

```bash
vercel --prod --yes
```

- [ ] **Step 4: Register the webhook with Telegram**

```bash
# Replace <TOKEN> and <SECRET> with actual values
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.obolai.xyz/api/telegram/bot",
    "secret_token": "<SECRET>"
  }'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

- [ ] **Step 5: Test**

Add the bot to a test group. Send `/price BTC`. Should get a response with price data and branding.

- [ ] **Step 6: Commit any adjustments**

If any tweaks are needed after testing, commit them.

---

## Summary

| Task | Feature | What |
|------|---------|------|
| 0 | Enhancement | Widen share eligibility (1-line change) |
| 1 | Prereq | Fix hardcoded domain in digest cron |
| 2 | Feature 1 | Add TWITTER_THREAD_MODE env var |
| 3 | Feature 1 | Add postThread() to twitter.ts |
| 4 | Feature 1 | Create tweet formatter |
| 5 | Feature 1 | Wire formatter into digest cron |
| 6 | Feature 2 | Token snapshot store + DB migration |
| 7 | Feature 2 | Token page data generator |
| 8 | Feature 2 | Wire token gen into digest cron |
| 9 | Feature 2 | Token page (Next.js) |
| 10 | Feature 2 | Token page OG image |
| 11 | Feature 2 | Dynamic sitemap |
| 12 | Feature 3 | Telegram bot env vars |
| 13 | Feature 3 | Telegram bot rate limiter |
| 14 | Feature 3 | Telegram bot data layer |
| 15 | Feature 3 | Telegram bot response formatter |
| 16 | Feature 3 | Telegram bot command router |
| 17 | Feature 3 | Telegram bot webhook handler |
| 18 | Feature 3 | Deploy + set up Telegram webhook |
