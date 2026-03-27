# Daily Digest Operations

## How It Works

A Vercel cron job hits `GET /api/digest/generate` daily at 08:00 UTC. The endpoint:

1. Checks `CRON_SECRET` Bearer auth
2. Skips if today's digest already exists (idempotent)
3. Fetches CoinGecko prices (6 fixed majors + top 4 gainers from top 100)
4. Fetches Dune data in parallel (whale flows, CEX flows, stablecoin supply)
5. Fetches GenVox sentiment for BTC, ETH, and top 2 movers ($0.03/each via x402)
6. Pre-reduces all raw data to ~3KB of headline numbers
7. Passes to AI model for synthesis (DeepSeek primary, Gemini fallback)
8. Saves to `reports` table as `type = 'digest'`
9. Sends Telegram alert if any sources failed

**Cost per digest:** $0.01 (all cached) to ~$0.43 (all fresh)

## Required Env Vars

| Var | Purpose | Required? |
|-----|---------|-----------|
| `CRON_SECRET` | Bearer auth for cron endpoint | Yes |
| `DUNE_API_KEY` | Dune Analytics queries | No (gracefully skipped) |
| `GENVOX_URL` | Sentiment analysis via x402 | No (gracefully skipped) |
| `DATABASE_URL` | Neon Postgres | Yes |
| `DEEPSEEK_API_KEY` or `AI_MODEL` | AI generation | Yes (at least one model) |

## Manual Trigger

Pull `CRON_SECRET` from Vercel and trigger:

```bash
# Get the secret (one-time)
vercel env pull .env.local
source .env.local

# Trigger digest generation
# IMPORTANT: use www.obolai.xyz — obolai.xyz 307-redirects to www, which strips the Auth header
curl -H "Authorization: Bearer $CRON_SECRET" https://www.obolai.xyz/api/digest/generate
```

Expected responses:
- `{"status":"created","id":"...","date":"2026-03-27"}` — new digest generated
- `{"status":"already_exists","id":"...","date":"2026-03-27"}` — already ran today
- `{"error":"Generation failed","detail":"..."}` — check logs

## Verify After Deploy

1. Trigger generation manually (see above)
2. Visit `https://obolai.xyz/digest` — should show the briefing
3. Visit `https://obolai.xyz/digest/YYYY-MM-DD` — same content at dated URL
4. Check `https://obolai.xyz/` — digest preview card should appear between "How it works" and "Research clusters"
5. Test OG card: paste `https://obolai.xyz/digest` into [Twitter Card Validator](https://cards-dev.twitter.com/validator) or share on X
6. Re-run the curl — should return `already_exists` (idempotency)

## Pages

| URL | What it shows |
|-----|---------------|
| `/digest` | Latest daily briefing |
| `/digest/YYYY-MM-DD` | Archived briefing by date |
| `/api/digest/generate` | Cron endpoint (GET, auth required) |

## Cron Config

In `vercel.json`:
```json
{ "path": "/api/digest/generate", "schedule": "0 8 * * *" }
```

## Troubleshooting

**No digest generated:**
- Check Vercel function logs for `[DIGEST]` entries
- Verify `CRON_SECRET` matches between Vercel env and the cron request
- Check if AI model keys are valid (DeepSeek/Gemini quota)

**Partial data (some sections missing):**
- Check Telegram alert — lists which sources failed
- `DUNE_API_KEY` missing or quota exhausted → Dune sections skipped
- `GENVOX_URL` missing → sentiment section shows null scores
- CoinGecko rate limited → prices empty, digest may be thin

**Duplicate prevention:**
- The endpoint checks `getDigestByDate(today)` before generating
- Safe to call multiple times — only the first call generates

**Re-generate today's digest:**
- Delete the existing one from the DB first:
  ```sql
  DELETE FROM reports WHERE type = 'digest' AND digest_date = '2026-03-27';
  ```
- Then trigger manually
