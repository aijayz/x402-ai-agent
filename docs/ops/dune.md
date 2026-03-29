# Dune Analytics — Operations Runbook

## Overview

Dune powers historical on-chain data for agent/cluster tools via 14 parameterized query templates.
Set `DUNE_API_KEY` to enable; all Dune calls are silently skipped when unset.

---

## Query Templates (14 total)

### Whale Flow (pre-warmed)

| Template | Dune Query ID | Notes |
|----------|---------------|-------|
| `whale_flow_ethereum` | 6909847 | All major ERC-20 addresses |
| `whale_flow_bitcoin` | 6918793 | |
| `whale_flow_solana` | 6918837 | |
| `whale_flow_bnb` | 6918857 | |

### On-demand (user-parameterized)

| Template | Dune Query ID |
|----------|---------------|
| `top_holder_changes_7d` | 6909911 |
| `dex_volume_7d` | 6909921 |
| `wallet_pnl_30d` | 6910133 |
| `liquidation_risk` | 6910139 |
| `bridge_flow_7d` | 6911550 |
| `stablecoin_supply_trend` | 6910160 |
| `smart_money_moves_7d` | 6910198 |
| `dex_pair_depth` | 6910213 |
| `flash_loan_activity` | 6910223 |
| `contract_interaction_trend` | 6910241 |
| `token_velocity` | 6910256 |
| `mev_exposure` | 6910274 |

---

## How queryDune() Works (3-tier)

```
Redis cache hit?  -> return (cache hit, ~5ms)
      | miss
Dune fast path?   -> return (no credits, ~200ms)
      | miss
  fastPathOnly?   -> return null
      | false
executeAndPoll    -> return (credits consumed, up to 30s)
```

Redis cache TTL: 6 hours. Poll interval: 2s, max 30s.

---

## Troubleshooting

### Dune Credits Exhausted (402)

- Telegram alert fires automatically
- Queries return null; clusters fall back gracefully
- Top up credits at https://dune.com/settings/billing

### No results on first run

Dune's fast path (`/results`) requires at least one prior execution. Trigger the relevant query once manually via the Dune UI to seed initial results.
