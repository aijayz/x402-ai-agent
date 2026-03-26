# Shareable Reports & Daily Digest — Design Spec

## Goal

Two related features that transform Obol from a reactive Q&A tool into a daily-use intelligence platform:

1. **Shareable Reports** — any AI analysis can be saved as a permalink with an OG image card, shareable on X/Farcaster for organic distribution
2. **Daily Digest** — scheduled synthesis of macro crypto signals delivered to users, creating a daily engagement habit

These build on existing infrastructure: visual markers (METRIC/SCORE/VERDICT), cluster tools, Dune templates, and CoinGecko pricing.

## Data Source Assessment

Before building, we need to be honest about what signals we can generate reliably:

**Strong sources (build digest around these):**
- CoinGecko — prices, 24h change, market cap (reliable, comprehensive)
- Dune `whale_net_flow_7d` + `cex_net_flow_7d` — real on-chain whale/exchange flow data
- Dune `top_holder_changes_7d` — factual holder distribution changes
- Dune `dex_volume_7d` — trading activity trends
- Dune `stablecoin_supply_trend` — macro buying power signal
- Dune `smart_money_moves_7d` — labeled wallet activity (quality depends on Dune labels)
- Messari token unlocks — high-signal, covers major tokens with vesting schedules

**Moderate sources (include but don't anchor on):**
- GenVox sentiment — single source, useful as supporting signal not primary
- QuantumShield token security — basic scoring, useful for new token flags
- Dune `bridge_flow_7d` — directional signal for L2 capital flows

**Known gaps (acknowledge, don't fake):**
- No labeled wallets (can't say "Jump Trading bought X" — only "large wallet bought X")
- No news/events feed (can't explain *why* something moved)
- No real-time monitoring (digest is periodic, not live)

**Key insight:** Obol's value is **AI synthesis across multiple signals**, not any single data point. "Whale outflow -$2.3M but DEX volume +40% and no unlocks for 60 days → profit-taking, not bearish" is analysis no single tool provides.

---

## Part 1: Shareable Reports

### User Flow

1. User runs any analysis in chat (e.g., "analyze AERO safety", "what are whales buying")
2. AI responds with visual markers (metrics, scores, verdicts) as it does today
3. A **Share** button appears on the assistant message
4. Click → POST to `/api/reports` → saves analysis → returns permalink
5. User sees a share modal with: copy link, share to X button
6. Permalink `obolai.xyz/r/{id}` is a public read-only page showing the full analysis
7. OG meta tags render a Satori-generated card with key metrics + verdict

### Database

New `reports` table in Neon:

```sql
CREATE TABLE reports (
  id TEXT PRIMARY KEY,           -- nanoid, 12 chars (e.g., "V1StGXR8_Z5j")
  wallet_address TEXT,           -- creator's wallet (nullable for anon)
  title TEXT NOT NULL,           -- AI-generated summary title
  content TEXT NOT NULL,         -- full markdown response text (includes marker syntax)
  markers JSONB,                 -- parsed structured markers for OG image
  metadata JSONB,               -- { model, tools_used, total_cost_micro, chain, tokens }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ         -- nullable, for auto-cleanup (90 days default)
);

CREATE INDEX idx_reports_wallet ON reports(wallet_address);
CREATE INDEX idx_reports_created ON reports(created_at DESC);
```

**ID format:** 12-char nanoid — short enough for URLs, collision-resistant. Example: `obolai.xyz/r/V1StGXR8_Z5j`

**Size budget:** A typical analysis is 1-3KB of markdown. At 1000 reports/day that's ~3MB/day, well within Neon's capacity.

**Expiry:** Reports expire after 90 days by default. A daily cron can clean up expired rows. Premium users could get permanent reports later.

### API Endpoints

**POST `/api/reports`** — save a report
```ts
// Request
{
  content: string;       // full AI response text with markers
  title?: string;        // optional, AI-generated if missing
  metadata?: {
    tools_used: string[];
    total_cost_micro: number;
    tokens_mentioned: string[];
    chain?: string;
  };
}

// Response
{ id: string; url: string; }
```

Auth: wallet session cookie (same as credits). Anonymous users can also save reports (wallet_address = null).

**GET `/api/reports/[id]`** — fetch a report (JSON, for client-side rendering)
```ts
// Response
{
  id: string;
  title: string;
  content: string;
  markers: StructuredMarker[];
  metadata: { ... };
  created_at: string;
}
```

No auth required — reports are public by design.

### Page Routes

**`/r/[id]/page.tsx`** — public report viewer
- Server component, fetches report from DB
- Renders: Obol branding header, title, `InlineSegments` from parsed content, metadata footer (date, tools used, cost)
- No chat UI, no input — read-only presentation
- Mobile-responsive
- "Try Obol" CTA button → links to `/chat`
- If report not found → 404 page

**`/r/[id]/opengraph-image/route.tsx`** — Satori OG image
- Uses `@vercel/og` (ImageResponse) to render a card
- Card layout:
  - Obol logo + "obolai.xyz" top-left
  - Report title (1-2 lines)
  - Up to 3 METRIC cards in a row (price, change, volume — extracted from markers)
  - VERDICT banner at bottom (colored green/amber/red)
  - SCORE gauge if present
- Size: 1200x630 (standard OG)
- Dark background matching the app theme

**`/r/[id]/twitter-image/route.tsx`** — same as OG but can be optimized for X's card format if needed (summary_large_image).

### Chat UI Changes

**Share button** — appears on assistant messages that contain structured markers:

```tsx
// In message rendering (chat/page.tsx)
{hasMarkers && (
  <button onClick={() => saveAndShare(message)} className="...">
    <Share2 className="size-3.5" /> Share
  </button>
)}
```

**Share modal** — after saving:
- Shows permalink with copy button
- "Share on X" button → opens `twitter.com/intent/tweet?url=...&text=...`
- Preview of the OG card (optional, nice-to-have)

### Title Generation

When saving a report, if no title is provided, extract one from the content:
- Use the first VERDICT text if present: "Low risk with strong fundamentals"
- Otherwise, first bold line: "Risk Assessment" → "AERO Risk Assessment"
- Fallback: "Obol Analysis — {date}"

No AI call needed — just string extraction from the markdown.

---

## Part 2: Daily Digest

### Concept

A scheduled job runs Obol's existing tools against a watchlist, synthesizes the results with AI, and delivers a structured briefing. Users access it via a new `/digest` route or receive it via Telegram.

### v1 Scope (MVP)

**Global digest** — one digest for all users, covering major tokens + macro signals. No per-user customization in v1.

**Signals to include:**
1. **Top 10 crypto prices** — CoinGecko: BTC, ETH, SOL, AERO, VIRTUAL, DEGEN, + top 4 by 24h change on Base
2. **Whale flow summary** — Dune `whale_net_flow_7d` for BTC, ETH, top 3 Base tokens
3. **CEX net flows** — Dune `cex_net_flow_7d` for ETH, BTC (exchange outflow = bullish signal)
4. **Stablecoin supply** — Dune `stablecoin_supply_trend` for Base + Ethereum
5. **Upcoming unlocks** — Messari unlocks for tokens with events in next 7 days
6. **Sentiment snapshot** — GenVox for BTC, ETH, and 1-2 trending tokens

**Not in v1:** per-user watchlists, custom alerts, Telegram delivery, real-time monitoring

### Architecture

**Cron job** — `/api/digest/generate` runs daily at 08:00 UTC via Vercel cron.

**Execution flow:**
1. Cron triggers → fetch all data sources in parallel (no credit cost — this is a system job)
2. CoinGecko: batch price fetch for 10 tokens
3. Dune: 5-6 queries (most will hit Redis cache if any user asked recently)
4. Messari: upcoming unlocks
5. GenVox: 2-3 sentiment queries
6. Collect all results → build a structured data payload
7. Pass payload to AI (single `generateText` call) with a digest-specific prompt
8. AI produces markdown with visual markers (METRIC, SCORE, VERDICT)
9. Save as a report in the `reports` table (type = "digest")
10. Serve at `/digest` (latest) and `/digest/[date]` (archive)

**Cost per digest:**
- CoinGecko: free (batch endpoint)
- Dune: 5-6 queries × $0 (likely cached) or ~$0.30 if all miss cache
- Messari unlocks: free
- GenVox: 3 × $0.03 = $0.09
- AI generation: ~$0.01 (single call, structured input)
- **Total: ~$0.10-$0.40/day worst case**

**Prompt structure for AI synthesis:**
```
You are Obol's market analyst. Generate a daily crypto briefing from the data below.

Structure:
1. Market Overview — prices + 24h changes as METRIC cards
2. Whale Signals — net flows, CEX flows, notable moves
3. Liquidity & Macro — stablecoin supply, bridge flows, DEX volume
4. Upcoming Events — token unlocks in next 7 days
5. Sentiment Pulse — social mood for major tokens
6. Daily Verdict — one-sentence synthesis

Use [METRIC:...], [SCORE:...], [VERDICT:...] markers throughout.
Be concise. No filler. Every sentence should convey a signal.

Data:
{JSON payload of all collected results}
```

### Database

Reuses the `reports` table with a `type` column:

```sql
ALTER TABLE reports ADD COLUMN type TEXT DEFAULT 'user';
-- type = 'user' for shareable reports
-- type = 'digest' for daily digests
-- type = 'digest_weekly' for future weekly summaries

ALTER TABLE reports ADD COLUMN digest_date DATE;
-- only set for digest-type reports, enables /digest/2026-03-26 lookups

CREATE UNIQUE INDEX idx_digest_date ON reports(digest_date) WHERE type = 'digest';
```

### Page Routes

**`/digest/page.tsx`** — latest daily digest
- Fetches most recent digest-type report
- Same rendering as `/r/[id]` (InlineSegments + visual markers)
- Header: "Daily Briefing — March 26, 2026"
- Navigation: prev/next day arrows for archive browsing
- "Get this daily" CTA (future: email/Telegram signup)
- If no digest exists for today → show yesterday's with a note

**`/digest/[date]/page.tsx`** — archived digest by date
- Same layout, specific date

**`/digest/opengraph-image/route.tsx`** — daily OG card
- "Obol Daily Briefing — Mar 26"
- Top 3 crypto prices with changes
- Daily verdict banner
- Shareable on X daily by the official Obol account → free daily impressions

### Landing Page Integration

Add a "Daily Digest" section to the landing page (`/`):
- Preview card showing today's top 3 metrics + verdict
- "Read full briefing →" link to `/digest`
- Updates daily — gives the landing page fresh content for SEO

### Cron Configuration

```json
// vercel.json
{
  "crons": [
    { "path": "/api/credits/check-topups", "schedule": "0 0 * * *" },
    { "path": "/api/digest/generate", "schedule": "0 8 * * *" }
  ]
}
```

The digest endpoint should be protected with `CRON_SECRET` (same pattern as check-topups).

---

## Implementation Order

### Phase 1: Shareable Reports (build first — foundation for digest)
1. `reports` table + migration SQL
2. Report store (`src/lib/reports/report-store.ts`)
3. POST `/api/reports` endpoint
4. GET `/api/reports/[id]` endpoint
5. `/r/[id]` page route with report viewer
6. `/r/[id]/opengraph-image` Satori OG card
7. Share button on chat messages
8. Share modal with copy link + X share

### Phase 2: Daily Digest (builds on reports infra)
1. Add `type` + `digest_date` columns to reports table
2. Digest data collector (`src/lib/digest/collector.ts`) — parallel data fetching
3. Digest generator (`src/lib/digest/generator.ts`) — AI synthesis
4. POST `/api/digest/generate` cron endpoint
5. `/digest` page route
6. `/digest/opengraph-image` route
7. Landing page digest preview section
8. Vercel cron config

### Phase 3: Personalization (future)
- Per-user watchlists (tokens + wallets to track)
- Custom alert thresholds ("notify me if whale outflow > $X")
- Telegram bot delivery
- Personal daily digest (your portfolio + your watchlist)
- Weekly summary roll-up

---

## Open Questions

1. **Report editing/deletion** — should users be able to delete their shared reports? Probably yes, via the chat UI or a simple `/api/reports/[id]` DELETE.
2. **Rate limiting on report creation** — prevent spam. Maybe 10 reports/day for free tier, 50 for wallet users.
3. **Digest token selection** — hardcoded top 10 for v1, but should we let the community vote on which tokens to cover? Could be a simple poll mechanism.
4. **Digest timing** — 08:00 UTC works for US/EU. Asian users might want a second digest at 00:00 UTC. Defer to Phase 3.
5. **Cost attribution** — digest data fetches are system costs, not user costs. Need a "system" account in the credit system, or just bypass credits for cron jobs.
6. **Cache warming** — the daily digest will warm the Redis cache for popular queries, benefiting users who ask similar questions that day. Nice side effect.
