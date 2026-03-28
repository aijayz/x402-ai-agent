# Growth Engine Testing Guide

Step-by-step testing for the 3 features + 1 enhancement deployed 2026-03-27.

---

## Prerequisites

Pull env vars locally (needed for curl commands):

```bash
vercel env pull .env.local
source .env.local
```

**Digest must run first** for Features 2 and 3 (`/alpha` command, token pages). If today's digest hasn't run yet, trigger it manually (see Feature 1 below).

---

## Enhancement: Widen Share Eligibility

The share button ("Share this analysis") now appears on any assistant message with 200+ characters of text, even without `[METRIC:]`/`[VERDICT:]`/`[SCORE:]` markers or paid tool calls.

**Test:**

1. Open https://www.obolai.xyz/chat
2. Ask a general question that produces a long response, e.g. `What is x402?`
3. Wait for the response to finish streaming
4. **Verify:** A "Share this analysis" button appears below the message (amber-colored bar)
5. Click it — the share panel should expand with X, Farcaster, Copy link, and Preview buttons

**Logic** (`src/components/ai-elements/message-actions.tsx:55`):
```
if (totalCost === 0 && !hasMarkers && textContent.length < 200) return null;
```
The button shows when ANY of: cost > 0, has markers, or text >= 200 chars.

---

## Feature 1: Smart Twitter Posts

The digest cron now auto-posts to X (@ai_obol) after generating. The format is controlled by `TWITTER_THREAD_MODE`.

**Env vars** (set in Vercel):

| Var | Purpose |
|-----|---------|
| `TWITTER_API_KEY` | X app key |
| `TWITTER_API_SECRET` | X app secret |
| `TWITTER_ACCESS_TOKEN` | X user access token |
| `TWITTER_ACCESS_SECRET` | X user access secret |
| `TWITTER_THREAD_MODE` | `single` (default), `pair`, or `thread` |

**Test:**

1. Trigger the digest cron manually:
   ```bash
   # Use www — obolai.xyz 307-redirects and strips the Auth header
   curl -H "Authorization: Bearer $CRON_SECRET" https://www.obolai.xyz/api/digest/generate
   ```

2. Expected response:
   - `{"status":"created","id":"...","date":"2026-03-27"}` — new digest + tweet posted
   - `{"status":"already_exists","id":"..."}` — already ran today (no new tweet)

3. Check [@ai_obol on X](https://x.com/ai_obol) for the new post

4. **Verify tweet content** based on `TWITTER_THREAD_MODE`:
   - `single` — One tweet with price data nugget + link to `/digest/YYYY-MM-DD`
   - `pair` — Two-tweet thread: hook + data block + link
   - `thread` — 4-5 tweet thread with prices, whale watch, sentiment, link

**If Twitter keys are not set**, the post silently returns `null` with no error. Check Vercel function logs for `[DIGEST] Twitter share failed:` if a tweet was attempted but failed.

**Re-test with a different mode** (requires redeploy since env is build-time):
```bash
# Change mode in Vercel dashboard, then:
vercel --prod --yes

# Delete today's digest to re-trigger:
# (run against prod DB)
# DELETE FROM reports WHERE type = 'digest' AND digest_date = '2026-03-27';

# Trigger again:
curl -H "Authorization: Bearer $CRON_SECRET" https://www.obolai.xyz/api/digest/generate
```

---

## Feature 2: Token SEO Pages

The digest cron now also generates token snapshot pages at `/token/<SYMBOL>`. These are ISR pages (revalidate daily) with Satori OG images and dynamic sitemap entries.

**Test** (requires digest to have run at least once):

1. Visit a token page, e.g. https://www.obolai.xyz/token/BTC
   - **Verify:** Page shows price, 24h change, market cap, score cards (Security, Whale Flow, Sentiment), intelligence bullets, and "Ask Obol about BTC" CTA
   - If 404: digest hasn't generated token snapshots yet — run it first

2. Check OG image renders:
   ```bash
   # Fetch the OG image directly
   curl -sI https://www.obolai.xyz/token/BTC/opengraph-image | head -20
   ```
   - Should return `200 OK` with `content-type: image/png`
   - Paste the URL into [Twitter Card Validator](https://cards-dev.twitter.com/validator) or share on X to preview

3. Check the sitemap includes token pages:
   ```bash
   curl -s https://www.obolai.xyz/sitemap.xml | grep '/token/'
   ```
   - Should list entries like `<loc>https://www.obolai.xyz/token/BTC</loc>`, one per token in the digest

4. Test a non-existent token returns 404:
   ```bash
   curl -sI https://www.obolai.xyz/token/DOESNOTEXIST
   ```
   - Should return `404`

**Token list** depends on digest data: 6 fixed majors (BTC, ETH, SOL, XRP, BNB, ADA) + top 4 gainers from CoinGecko top 100.

---

## Feature 3: Telegram Community Bot

A webhook-driven bot that responds to commands in Telegram groups.

**Env vars** (set in Vercel):

| Var | Purpose |
|-----|---------|
| `TELEGRAM_GROUP_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_BOT_WEBHOOK_SECRET` | Secret for webhook verification |

**Setup:** The webhook must be registered with Telegram pointing to:
```
https://www.obolai.xyz/api/telegram-bot
```

**Test commands** (in the Telegram group where the bot is added):

| Command | Expected Response |
|---------|-------------------|
| `/help` | Command list: /price, /safe, /whales, /alpha, mention hint |
| `/price ETH` | Price + 24h change + market cap |
| `/price` (no arg) | `Usage: /price ETH` |
| `/safe PEPE` | Security score + verdict |
| `/whales ETH` | Whale flow summary (net inflow/outflow) |
| `/alpha` | Today's top insight from the daily digest (requires digest to have run) |
| `@botname what is BTC?` | "Free-form AI answers coming soon!" (Phase 2) |

**Rate limiting:** Each group gets a limited number of calls per window. If rate-limited, the bot responds with a "slow down" message.

**Verify webhook is working** (from local terminal):
```bash
# Simulate a webhook call (replace with your secret)
curl -X POST https://www.obolai.xyz/api/telegram-bot \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_BOT_WEBHOOK_SECRET" \
  -d '{
    "message": {
      "message_id": 1,
      "chat": {"id": 12345, "type": "group"},
      "text": "/help",
      "entities": [{"type": "bot_command", "offset": 0, "length": 5}]
    }
  }'
```
Expected: `200 OK` (the response is sent via Telegram API, not in the HTTP body).

**If `/alpha` returns "No digest available today yet"**: the digest hasn't run. Trigger it first (see Feature 1).

---

## Quick Checklist

| # | Feature | Test | Pass? |
|---|---------|------|-------|
| 1 | Share eligibility | Long response in /chat shows share button | |
| 2 | Twitter post | Digest cron posts to @ai_obol | |
| 3 | Token page | /token/BTC loads with price + scores | |
| 4 | Token OG | /token/BTC/opengraph-image returns PNG | |
| 5 | Sitemap | /sitemap.xml includes /token/* entries | |
| 6 | Telegram /help | Bot replies with command list | |
| 7 | Telegram /price | `/price ETH` returns price data | |
| 8 | Telegram /alpha | Returns today's digest insight | |
