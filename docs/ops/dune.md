# Dune Analytics -- Operations Runbook

## Overview

Dune powers on-chain data in two contexts:

1. **Digest** -- 6 fixed-param queries pre-warmed nightly, consumed via fast path (no credits)
2. **Agent / Clusters** -- 14 user-parameterized queries, executed on demand (consumes credits)

---

## Pre-warm System

The digest cron (`00:00 UTC`) never executes Dune queries inline -- that would take up to 30s per query and time out the function. Instead, a pre-warm cron fires 30 min earlier to trigger the executions:

| Cron | Schedule | What it does |
|------|----------|-------------|
| `/api/dune/prewarm` | `30 23 * * *` (23:30 UTC) | Fires 6 Dune executions, returns immediately |
| `/api/digest/generate` | `00 00 * * *` (00:00 UTC) | Reads results via fast path (~200ms each) |

### Pre-warmed queries (6 total)

| Template | Params | Dune Query ID |
|----------|--------|---------------|
| `whale_flow_ethereum` | All major ERC-20 addresses | 6909847 |
| `whale_flow_bitcoin` | (none) | 6918793 |
| `whale_flow_solana` | (none) | 6918837 |
| `whale_flow_bnb` | (none) | 6918857 |
| `stablecoin_supply_trend` | chain=ethereum | 6910160 |
| `stablecoin_supply_trend` | chain=base | 6910160 |

### On-demand only queries (10 total -- params are user-supplied)

| Template | Dune Query ID |
|----------|---------------|
| `top_holder_changes_7d` | 6909911 |
| `dex_volume_7d` | 6909921 |
| `wallet_pnl_30d` | 6910133 |
| `liquidation_risk` | 6910139 |
| `bridge_flow_7d` | 6911550 |
| `smart_money_moves_7d` | 6910198 |
| `dex_pair_depth` | 6910213 |
| `flash_loan_activity` | 6910223 |
| `contract_interaction_trend` | 6910241 |
| `token_velocity` | 6910256 |
| `mev_exposure` | 6910274 |

---

## Manual Testing

```bash
# Set CRON_SECRET (from Vercel env)
export CRON_SECRET=<your-secret>

# 1. Trigger pre-warm (fires 6 Dune executions)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.obolai.xyz/api/dune/prewarm
# Expected: {"status":"ok","triggered":6}

# 2. Wait ~30s for Dune to finish

# 3. Trigger digest (reads Dune fast path, no polling)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.obolai.xyz/api/digest/generate
# Expected: {"status":"ok",...} with whale/stablecoin data present
```

Note: `obolai.xyz` 307-redirects to `www.obolai.xyz`. If curl follows redirects but drops the header, use `https://www.obolai.xyz/...` directly. From a local machine behind a corporate proxy, use `https://obolai.vercel.app/...` instead.

---

## Troubleshooting

### Digest missing whale/stablecoin data

1. Check Vercel function logs for `[DUNE] Fast-path miss` -- means pre-warm didn't run or Dune execution hasn't completed yet
2. Manually trigger pre-warm, wait 60s, then trigger digest
3. If pre-warm returns `triggered: 0`, check that `DUNE_API_KEY` is set in Vercel env

### Pre-warm returns `triggered: 0`

- `DUNE_API_KEY` is unset or the templates have `duneQueryId: 0` -- check `src/lib/services/dune-templates.ts`

### Dune Credits Exhausted (402)

- Telegram alert fires automatically
- Pre-warm will fail silently; digest falls back to fast path (yesterday's cached data)
- Top up credits at https://dune.com/settings/billing

### First-ever run (no previous results)

Dune's fast path (`/results`) requires at least one prior execution. On first deploy:

```bash
# Trigger pre-warm to seed initial results
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.obolai.xyz/api/dune/prewarm
# Wait 60s, then the digest will have data
```

---

## How queryDune() Works (3-tier)

```
Redis cache hit?  -> return (cache hit, ~5ms)
      | miss
Dune fast path?   -> return (no credits, ~200ms)
      | miss
  fastPathOnly?   -> return null (digest/pre-warm context -- never blocks)
      | false
executeAndPoll    -> return (credits consumed, up to 30s)
```

The digest always uses `fastPathOnly: true`. Agent/cluster tools use the full 3-tier.
