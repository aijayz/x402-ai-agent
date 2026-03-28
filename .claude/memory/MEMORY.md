# Obol AI - Project Memory

## Project Identity

**Product name:** Obol AI
**URLs:** https://obolai.xyz (primary), https://www.obolai.hk
**Vercel project:** `prj_EmIK8e1f3Rxp4bLcabzRWds6Df3h`
**Icon:** Strike-through O with blue→purple gradient (`public/icon.svg`)
**Note:** Obol Network (DeFi DVT protocol) exists — using "Obol AI" to differentiate.

## Business Direction

**Model:** "Practical Hybrid" — AI chat + x402 service orchestration. Revenue = 30% margin on tool calls.

## Current State (2026-03-28)

- Deployed to production on Base mainnet
- x402 v2.8.0, x402-mcp v0.1.1
- AI model: deepseek/deepseek-chat (primary), fallback chain in place
- Git auto-deploy NOT enabled — deployments are manual (`vercel --prod --yes`)
- Multi-chain EVM deposits: DEPLOYED (Base, Ethereum, Arbitrum, Optimism)

## Completed Phases

- Phase 1 (orchestrated agent): DONE
- Phase 1 polish: DONE
- Production readiness: DONE
- Phase 2a (multi-chain EVM deposits): DONE
- Credit onboarding + Sybil guard: DONE
- Security hardening: DONE
- Open-source repo: DONE
- Dune Analytics integration: DONE
- Shareable Reports: DONE
- Daily Digest: DONE
- Growth Engine: DONE (2026-03-28)

## Growth Engine (LIVE as of 2026-03-28)

- **Share eligibility**: widened to any 200+ char response
- **Twitter auto-post**: digest cron posts to @ai_obol after generating
- **Token SEO pages**: `/token/[symbol]` with ISR + Satori OG images + sitemap
- **Telegram community bot**: `@obol_ai_bot` responds to `/price`, `/safe`, `/whales`, `/alpha`, `/help`
  - Webhook URL: `https://www.obolai.xyz/api/telegram/bot` (NOT `/api/telegram-bot`)
  - `TELEGRAM_GROUP_BOT_TOKEN` = same token as `TELEGRAM_BOT_TOKEN` (same bot `@obol_ai_bot`)
  - Bot username hardcoded in `src/app/api/telegram/bot/route.ts:51`
  - `TELEGRAM_BOT_WEBHOOK_SECRET` must only contain `A-Z a-z 0-9 _ -` (Telegram restriction)

## Cron Jobs

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/credits/check-topups` | `0 0 * * *` | Check pending top-ups |
| `/api/digest/generate` | `0 0 * * *` | Daily digest + token snapshots + Twitter post |

- Manual trigger (must use `www` domain — `obolai.xyz` 307-redirects and strips Auth header):
  ```bash
  ssh root@67.230.179.238 "curl -s -H 'Authorization: Bearer $CRON_SECRET' https://www.obolai.xyz/api/digest/generate"
  ```

## Key Architecture Notes

- `@t3-oss/env-nextjs` inlines env at build time — env changes require redeploy
- Purchaser wallet: `0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e`
- Seller wallet: `0x545442553E692D0900005d7e48885684Daa0C4f0`
- Model probe cache: 5min success TTL, 2min failure TTL
- IP free call counter: Redis INCR `free:ip:{ip}`, 24h TTL, max 2 calls
- Wallet session: `wallet_auth` HttpOnly cookie (7d), restored via `/api/auth/me`
- 9 x402 service adapters: Augur, GenVox, SLAMai, Messari Unlocks, Messari Allocations, QS Token Security, QS Contract Audit, QS Wallet Risk, QS Whale Activity
- Removed services (dead): rug-munch (404), diamond-claws (530), slamai-token-holders, wallet-iq

## Infrastructure

- VPS: `67.230.179.238`, SSH key `~/.ssh/id_ed25519_vps`, user `root`
  - Use for outbound HTTP — local Netskope proxy blocks HTTPS to obolai.xyz
- Two Neon databases: production (`ep-cool-shape`, ap-southeast-1), staging (`ep-restless-field`, us-east-1)
- Public repo: https://github.com/aijayz/x402-ai-agent
- Private repo: `git@github-personal:aijayz/obol-ai-private.git`

## User Preferences

- UI changes: ALWAYS invoke `frontend-design` skill before any UI/design work
- Don't deploy on every small change — deploy when ready
- Concise communication, no unnecessary explanations

## Plans Location

- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans
- `docs/ops/` — operational runbooks
