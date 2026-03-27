# Obol AI Growth Engine — Design Spec

**Date:** 2026-03-27
**Goal:** Product-led growth through automated content, SEO, social sharing, and community bot
**Target audience:** Crypto traders, DeFi researchers, CT audience, crypto-curious newcomers
**Budget:** Near-zero — all strategies are built into the product
**Primary domain:** obolai.xyz

---

## Overview

Four features that compound into a self-reinforcing growth flywheel:

```
Digest cron generates data daily
  -> Smart Twitter post (drives followers)
  -> Token SEO pages updated (drives organic search)
  -> Telegram bot answers from cached data (drives group exposure)
  -> Users share chat answers (drives social proof)
    -> All roads lead to obolai.xyz/chat
      -> More usage -> more shared answers -> more visibility
```

**Build order:** 1 (Twitter) -> 2 (Shareable answers) -> 3 (Token pages) -> 4 (Telegram bot)

Quick wins first (1, 2 are small effort), then the larger features (3, 4).

---

## Feature 1: Smart Twitter Posts

**Effort:** Small | **Cost:** $0/day

### Problem
Current digest posts a single tweet that gets truncated or ignored. New @ai_obol account needs to build credibility before going high-volume.

### Design

**Phased rollout based on account maturity:**

**Phase 1 (first 2-3 weeks, <200 followers): Single tweet, daily**

The digest cron generates one punchy tweet with the best data nugget from the day. Template-driven with AI filling narrative slots.

Example:
```
Mar 27 -- Whales moved $47M ETH to exchanges overnight
while smart money quietly loaded $2.1M ARB before next week's unlock.

Stablecoin supply up $320M -- dry powder building.

Full daily brief -> obolai.xyz/digest
```

Design principles:
- No emoji spam (0-1 per tweet, used for visual anchoring only)
- Lead with concrete numbers, not vague commentary
- No hashtags in the body (one or two at the end only if needed)
- Reads like a Bloomberg terminal alert, not a shill
- Always ends with link to full digest

**Phase 2 (200-500 followers): 2-tweet pairs**

Hook tweet + one data tweet. Test engagement before expanding.

**Phase 3 (1K+ followers): Full 4-5 tweet thread**

Only on high-volatility days. Quiet days stay at 1-2 tweets.

Thread structure:
```
Tweet 1 (hook):
Mar 27 -- Daily On-Chain Brief

ETH -4.2% as whales moved $47M to exchanges
PEPE surged 18% on renewed memecoin momentum
Smart money quietly loading ARB before unlock

Full thread ->

Tweet 2 (price table):
Top movers today

SOL     $142.80   +6.1%
PEPE    $0.0081   +18.2%
BTC     $68,420   -0.3%
ETH     $2,103    -4.2%
AVAX    $28.14    -3.8%

Tweet 3 (whale intelligence):
Whale watch

-> 3 wallets (>$10M AUM) added $2.1M ARB in 7d
-> $47M net ETH outflow to Binance, Coinbase
-> Stablecoin supply up $320M this week

Tweet 4 (sentiment):
Sentiment snapshot (via GenVox)

BTC  ||||||....  62 -- cautious
ETH  ||||......  41 -- fear
SOL  ||||||||..  78 -- bullish

Tweet 5 (CTA):
Full briefing with sources
-> obolai.xyz/digest

Or ask Obol anything on-chain
-> obolai.xyz/chat
```

### Implementation

**Files to create/modify:**
- `src/lib/twitter.ts` — add `postThread(tweets: string[])` using twitter-api-v2 reply chain. Keep existing `postTweet()` for Phase 1.
- `src/lib/digest/tweet-formatter.ts` — template-driven formatter that extracts data points from digest and fills slots. AI generates only the 1-2 narrative sentences.
- `src/app/api/digest/generate/route.ts` — after digest generation, call tweet formatter and post.

**Config:**
- `TWITTER_THREAD_ENABLED` env var — add to `src/lib/env.ts` as `z.enum(["true","false"]).optional()` (t3-env requires Zod string coercion, not native boolean). When absent or "false", posts single tweet (Phase 1). When "true", posts full thread (Phase 3).

**Bug fix (prerequisite):** `src/app/api/digest/generate/route.ts` hardcodes `obolai.app` in tweet/Telegram URLs. Change to use `env.URL` so links point to the correct production domain (`obolai.xyz`).

**Data sources:** All data already available from digest collector output. Zero additional API calls.

---

## Feature 2: Shareable Chat Answers

**Effort:** Small-Medium | **Cost:** ~$0/day

### Problem
Great AI answers die in the chat session. No way for users to share individual answers as social proof.

### Design

Extend the existing report sharing pattern (`/r/[id]`) to individual chat answers. Any Obol response gets a share button that creates a standalone page at `/a/[id]`.

**Share flow:**
```
User asks question -> gets answer -> clicks Share icon (hover/tap on message)
-> POST /api/answers (saves Q+A pair, returns id)
-> Share panel appears (same as /r/[id]: X, Farcaster, Copy Link, Preview)
-> Shared page at /a/[id] with OG card
```

**Shared answer page layout:**
```
obolai.xyz/a/abc123

"Is PEPE safe to buy right now?"

[Obol's answer rendered with full markdown/tool cards]

Tools used: Token Security, Whale Tracker, Sentiment -- $0.04 total

[Ask Obol your own question -> obolai.xyz/chat]

Share: [X] [Farcaster] [Copy Link]

Powered by Obol AI | x402 intelligence
```

**OG card (Satori):**
```
"Is PEPE safe to buy?"

Security: 87/100
Whales: +$3.2M inflow (7d)
Sentiment: 71/100 bullish

obolai.xyz          Powered by x402
```

**Key details:**
- Share button appears on every Obol response (not user messages)
- Save extracts the question (last user message) + the answer (assistant message with tool results)
- Key metrics for OG card extracted from `tool_results` JSONB field at render time (not parsed from markdown text). The `POST /api/answers` endpoint saves structured tool outputs alongside the rendered answer. The Satori OG renderer reads scores/prices/flows directly from this structured data.
- "Tools used: $0.04 total" in the page subtly communicates value proposition
- Viewer's page has prominent CTA to ask their own question
- Re-sharing: the shared page itself has share buttons (viral chain)

### Implementation

**Files to create:**
- `src/app/a/[id]/page.tsx` — shared answer page
- `src/app/a/[id]/opengraph-image.tsx` — Satori OG card
- `src/app/a/[id]/not-found.tsx` — 404 for invalid IDs
- `src/app/api/answers/route.ts` — POST to save Q+A pair, returns { id, url }
- `src/lib/answers/answer-store.ts` — CRUD for shared answers (new `shared_answers` table — avoids extending `ReportStore`'s `"user" | "digest"` type union)

**Files to modify:**
- `src/components/ai-elements/message.tsx` — add share icon on Obol responses
- `src/app/sitemap.ts` — include shared answer pages (optional, they're user-generated)
- DB migration — `shared_answers` table (id, question, answer_content, metadata JSON, created_at)

**Reusable patterns from existing /r/[id]:**
- Satori OG image generation
- Share panel component (X/Farcaster/Copy Link)
- Report viewer rendering (markdown + tool cards)

---

## Feature 3: Token-Specific SEO Pages

**Effort:** Medium | **Cost:** ~$0.55/day

### Problem
No organic search presence. People searching "ETH whale activity today" or "PEPE token security" land on CoinGecko or Twitter, not Obol.

### Design

Auto-generated pages at `/token/[symbol]` that aggregate everything Obol knows about a token. Updated daily by the digest cron.

**Page layout:**

```
obolai.xyz/token/ETH

Header: Ethereum (ETH) — $2,103 (-4.2% 24h) — MCap: $253B

Three score cards:
  [Security Score: 92/100]  [Whale Flow: -$47M outflow]  [Sentiment: 41/100 fear]

Recent intelligence (bullet list):
  - 3 whale wallets sold $12M in 48h
  - Contract verified, no known exploits
  - Upcoming: Pectra upgrade in ~14 days

CTA: "Ask Obol about ETH ->" (links to /chat?q=Tell me about ETH)

Footer: Last updated Mar 27 08:00 UTC | Data via x402 intelligence
```

**Token selection:**

Fixed set (10 tokens, always have pages):
- BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, POL
- Note: `src/lib/digest/tokens.ts` `FIXED_MAJORS` only has 6 tokens. The token page generator maintains its own independent fixed set of 10 (superset of digest majors). The extra 4 (DOGE, AVAX, LINK, POL) are fetched separately from CoinGecko.

Dynamic set (rotates daily, ~7 tokens):
- Top 4 gainers from CoinGecko top 100 (same as digest)
- Top 3 losers — people search more when tokens crash ("why is X dumping"). Note: `getDigestTokens()` currently only fetches gainers. The token page generator must call CoinGecko markets API independently to fetch top losers.

Over time the catalog grows organically to 50-100+ tokens as different tokens rotate through.

**Data sources (all already integrated):**
- Price + market data: CoinGecko (free, already in digest collector)
- Whale flows: Dune templates — whale_net_flow_7d, cex_net_flow_7d (cached)
- Sentiment: GenVox ($0.03 per token via x402)
- Security score: QuantumShield token security ($0.001)
- Token unlocks: Messari (free)

**Generation strategy: Piggyback on digest cron (Option 1)**

After generating the daily digest, the same cron triggers token page generation for the ~17 tokens covered that day. No extra cron, no extra scheduling. Data is already fetched for the 6 majors + 4 gainers; the extra 4 fixed tokens and 3 losers are fetched independently.

### SEO mechanics
- `generateMetadata()` with title: "ETH On-Chain Intelligence -- Whale Activity, Security, Sentiment | Obol AI"
- Satori OG images (same pattern as /digest and /r/[id])
- Dynamic `sitemap.xml` listing all token pages
- JSON-LD structured data for Google rich snippets

### Implementation

**Files to create:**
- `src/app/token/[symbol]/page.tsx` — token page (server component, ISR with `export const revalidate = 86400` — data updates once daily, no need for force-dynamic)
- `src/app/token/[symbol]/opengraph-image.tsx` — Satori OG card
- `src/lib/token-pages/generator.ts` — fetches + assembles token data from multiple sources
- `src/lib/token-pages/store.ts` — CRUD for token snapshots (new `token_snapshots` table — cleaner than extending `reports` which has a typed union of `"user" | "digest"`)
- `src/app/sitemap.ts` — dynamic sitemap including all token pages

**Files to modify:**
- `src/app/api/digest/generate/route.ts` — after digest completes, trigger token page generation
- DB migration — `token_snapshots` table (symbol, data JSON, updated_at, created_at)

---

## Feature 4: Telegram Community Bot

**Effort:** Medium-Large | **Cost:** ~$0.10/day

### Problem
Current Telegram integration is one-way (Obol -> channel). The audience lives in crypto Telegram groups but has no way to interact with Obol there.

### Design

A Telegram bot (`@obol_ai_bot`) that can be added to any group. Responds to commands and mentions with on-chain intelligence. Every response includes branding + link back to obolai.xyz.

**Commands:**

| Command | Response | Cost | Source |
|---------|----------|------|--------|
| `/price ETH` | Price + 24h change + mcap | Free | CoinGecko (cached) |
| `/safe PEPE` | Quick security score + top holder % | $0.001 (subsidized) | QuantumShield |
| `/whales ETH` | Whale flow summary (7d) | Free | Dune (cached) |
| `/alpha` | Today's top mover + one-line why | Free | Digest data |
| `@obol_ai_bot <question>` | Free-form AI answer | Subsidized (house wallet) | Full orchestrator |

**Rate limits:**
- Free commands: 10/hour per group
- `/safe`: 5/hour per group (costs money)
- `@mention` free-form: 3/day per group, fully subsidized by house wallet (no wallet linking needed — Telegram users have no credit account). Beyond 3/day, shows "For unlimited answers -> obolai.xyz/chat"

**Response format:**
```
PEPE Token Security Check

Security Score: 87/100
Contract: Verified, no known exploits
Whale activity: +$3.2M net inflow (7d)

>> Watch: Top 10 holders own 42% of supply

Deep analysis -> obolai.xyz/token/PEPE
Ask more -> obolai.xyz/chat
---
Powered by Obol AI | x402 intelligence
```

**Anti-spam:**
- Bot only responds when explicitly mentioned or commanded (never unsolicited)
- Group admins can enable/disable specific commands
- Rate limiting per group (not per user, to prevent abuse)

**Distribution strategy:**

Phase 1 (Week 1): Own group + 2-3 friends' groups — test and iterate
Phase 2 (Week 2-3): Pitch to 10-15 mid-size crypto groups (500-5K members) manually
Phase 3 (Week 4+): Viral mechanic — "Add to your group" button on obolai.xyz + deep link in bot responses

Key channels:
- x402 ecosystem groups (Base, Coinbase CDP)
- Hong Kong / Asia crypto communities (leverage obolai.hk domain)
- "Add Obol to your group" CTA after every chat interaction on obolai.xyz
- Telegram deep link: t.me/obol_ai_bot?startgroup=true

### Implementation

**Files to create:**
- `src/app/api/telegram/bot/route.ts` — webhook handler for group bot (separate from existing alert channel)
- `src/lib/telegram-bot/commands.ts` — command parser and router
- `src/lib/telegram-bot/responses.ts` — response formatter (consistent branding)
- `src/lib/telegram-bot/rate-limit.ts` — per-group rate limiting (Redis)
- `src/lib/telegram-bot/data.ts` — thin layer over existing services (reads cached digest data, CoinGecko, Dune, QS)

**Files to modify:**
- `src/lib/env.ts` — add `TELEGRAM_GROUP_BOT_TOKEN` (separate from existing alert bot token) and `TELEGRAM_BOT_WEBHOOK_SECRET` for webhook verification
- Landing page — add "Add to Telegram" CTA button

**Infrastructure:**
- Telegram Bot API webhook mode (not polling) — works natively on Vercel serverless
- Separate bot token from existing alert bot (different bot, different purpose)
- Upstash Redis for rate limiting (same instance as existing rate limiter)

---

## Database Changes Summary

Two new tables (dedicated tables, not extending `reports` — keeps type safety clean):

**token_snapshots:**
- `id` (uuid, PK)
- `symbol` (varchar, indexed)
- `data` (jsonb — price, security, whale, sentiment, unlocks)
- `digest_date` (date — which digest generated this)
- `created_at`, `updated_at`

**shared_answers:**
- `id` (nanoid, PK — short for URLs)
- `question` (text)
- `answer` (text — rendered markdown)
- `tool_results` (jsonb — structured tool outputs for OG card)
- `total_cost` (decimal — tools cost for display)
- `created_at`

---

## Cost Summary

| # | Feature | Daily cost | Effort |
|---|---------|-----------|--------|
| 1 | Smart Twitter posts | $0 | Small |
| 2 | Shareable chat answers | ~$0 | Small-Medium |
| 3 | Token SEO pages | ~$0.55 | Medium |
| 4 | Telegram community bot | ~$0.10 | Medium-Large |
| | **Total** | **~$0.65/day** | |

Monthly total: ~$20/month for a complete automated growth engine.

---

## Success Metrics

| Metric | Baseline (now) | 30-day target |
|--------|---------------|---------------|
| Twitter followers (@ai_obol) | ~0 | 200+ |
| Daily organic visits (non-direct) | ~0 | 50+ |
| Token pages indexed by Google | 0 | 15+ |
| Telegram groups with bot | 0 | 5-10 |
| Shared answers created | 0 | 20+ |
| Chat sessions / day | ? | 2x current |
