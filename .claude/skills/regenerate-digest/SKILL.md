---
name: regenerate-digest
description: Regenerate the daily digest and token snapshots for Obol AI. Use this skill when the user says "regenerate digest", "regen digest", "refresh digest", "rerun digest", wants to update token pages with fresh data, or after code changes to the digest/token-pages pipeline. Also triggers on "/regenerate-digest" or "/regen-digest".
---

# Regenerate Daily Digest

This skill automates the full digest regeneration workflow: pull credentials, optionally prewarm Dune, delete stale data, trigger generation, and verify results.

## Prerequisites

- Vercel CLI linked to the project (`vercel link` already done)
- Production deployment is current (if code changed, deploy first with `vercel --prod --yes`)

## Workflow

### Step 1: Pull credentials

```bash
vercel env pull .env.production.local --environment production --yes 2>/dev/null
```

Extract the two keys you need:
```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.production.local | cut -d= -f2- | tr -d '"')
DATABASE_URL=$(grep '^DATABASE_URL=' .env.production.local | cut -d= -f2- | tr -d '"')
TODAY=$(date -u +%Y-%m-%d)
```

### Step 2: Decide on Dune prewarm

Ask the user: "Do you want to prewarm Dune queries first? This takes ~10 minutes but gives fresher whale flow data."

If yes:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://obolai.vercel.app/api/dune/prewarm" | jq .
```
Then tell the user to wait ~10 minutes before continuing. Use the domain `obolai.vercel.app` (works through corporate proxy).

If no (or user says "skip prewarm"), proceed directly to Step 3.

### Step 3: Check and delete existing data

Check what exists for today:
```bash
psql "$DATABASE_URL" -c "SELECT id, digest_date, created_at FROM reports WHERE type = 'digest' AND digest_date = '$TODAY';"
psql "$DATABASE_URL" -c "SELECT count(*) as snapshot_count FROM token_snapshots WHERE digest_date = '$TODAY';"
```

If data exists, **confirm with user before deleting**, then:
```bash
psql "$DATABASE_URL" -c "DELETE FROM token_snapshots WHERE digest_date = '$TODAY';"
psql "$DATABASE_URL" -c "DELETE FROM reports WHERE type = 'digest' AND digest_date = '$TODAY';"
```

If no data exists, skip deletion and proceed.

### Step 4: Trigger digest generation

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://obolai.vercel.app/api/digest/generate" | jq .
```

Expected response: `{ "status": "created", "id": "...", "date": "YYYY-MM-DD" }`

This endpoint has a 120s timeout. If it times out, check Vercel function logs. The digest also posts to Telegram and Twitter (fire-and-forget, failures don't block).

### Step 5: Verify results

Check token snapshots have intelligence and unlocks:
```bash
psql "$DATABASE_URL" -c "SELECT symbol, jsonb_array_length(data->'intelligence') as intel, data->'unlocks'->>'category' as category FROM token_snapshots WHERE digest_date = '$TODAY' ORDER BY symbol;"
```

Verify the digest page:
```bash
curl -s "https://obolai.vercel.app/digest" | grep -o '<title>[^<]*</title>'
```

Report summary: how many tokens, how many have intelligence bullets, how many have unlocks data.

### Step 6: Cleanup

```bash
rm -f .env.production.local
```

## Important notes

- Always use `obolai.vercel.app` for API calls (works through corporate proxy, unlike obolai.xyz)
- The `obolai.xyz` domain 307-redirects to `www.obolai.xyz` — manual triggers must use `obolai.vercel.app` or `www.obolai.xyz`
- Token snapshots are generated as part of digest — no separate call needed
- Intelligence bullets are generated via LLM (DeepSeek/Gemini fallback chain)
- Unlocks data comes from Messari Redis cache (free, no API cost)
- Prewarm fires 6 Dune queries: whale_flow_ethereum, whale_flow_bitcoin, whale_flow_solana, whale_flow_bnb, stablecoin_supply_trend x2
