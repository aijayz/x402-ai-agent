# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start development server with Turbopack
pnpm build            # Build for production with Turbopack
pnpm start            # Start production server
pnpm typecheck        # Run TypeScript type checking (no emit)
```

### Scripts

```bash
# Sweep USDC/ETH from CDP wallets to cold wallet
npx tsx scripts/sweep.ts --to 0xYourColdWallet --dry-run    # Preview balances
npx tsx scripts/sweep.ts --to 0xYourColdWallet              # Sweep both wallets
npx tsx scripts/sweep.ts --to 0xYourColdWallet --wallet purchaser  # Purchaser only
npx tsx scripts/sweep.ts --to 0xYourColdWallet --wallet seller     # Seller only
```

### Operational Docs

See `docs/ops/` for operational runbooks:
- `sweep.md` — Single-chain and multi-chain wallet sweep instructions
- `webhooks.md` — Alchemy webhook setup per chain
- `multi-chain.md` — Chain config reference, deposit addresses, adding new chains

## Architecture Overview

**x402 AI Agent** is an AI chat agent that orchestrates paid research services via the x402 protocol (HTTP 402 micropayments with USDC on Base). Users get 2 free tool calls, then connect a wallet to claim tiered free credits based on wallet age (Sybil guard). When credits are depleted, users top up with USDC.

**Stack:**
- **x402 protocol**: HTTP-native USDC payments on Base blockchain
- **MCP (Model Context Protocol)**: AI tool integration with paid tools
- **AI SDK v6**: Chat with streaming, ToolLoopAgent, `createAgentUIStreamResponse`
- **DeepSeek / Gemini**: AI model providers with probe-based fallback chain
- **CDP Wallets**: Coinbase-managed house wallet for payment operations
- **Neon Postgres**: Credit system and session tracking
- **Upstash Redis**: Rate limiting (optional, graceful degradation)

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page — hero, research clusters, MCP tools, pricing |
| `/chat` | AI chat interface with suggestion categories |

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/chat` | AI chat endpoint — orchestrator agent with MCP tools |
| `/mcp` | MCP server with paid tools |
| `/api/credits/balance` | Get wallet credit balance |
| `/api/credits/topup` | Initiate USDC deposit |
| `/api/credits/topup/confirm` | Confirm deposit transaction |
| `/api/credits/claim` | Claim free credits on wallet connect (with wallet-age Sybil guard) |
| `/api/credits/check-topups` | Cron job — check pending top-ups |
| `/api/credits/webhook` | Alchemy webhook for deposit confirmation |
| `/api/registry` | x402 service registry API |
| `/api/auth/me` | Restore wallet session from HttpOnly cookie (page refresh) |
| `/api/v1/research/*` | Public x402-gated research API (6 endpoints) |

### Key Architecture Patterns

**Orchestrator Agent** (`src/lib/agents/orchestrator.ts`)
- `ToolLoopAgent` with 12-step limit and 120s timeout
- System prompt with spending authority — never asks "should I proceed?"
- Silently retries 402 errors (payment handled by `withAutoPayment`)
- Budget-aware: checks credit balance before expensive tools

**MCP Integration** (`src/app/mcp/route.ts`)
- Remote MCP server with `paidTool()` and `tool()` helpers
- Paid tools: `get_crypto_price` ($0.01), `get_wallet_profile` ($0.02), `summarize_url` ($0.03), `analyze_contract` ($0.03), `generate_image` ($0.05)
- Free tools: `add`, `get_random_number`, `hello-remote`
- Chat endpoint connects as MCP client with `withAutoPayment()` wrapper

**Service Registry** (`src/lib/services/`)
- Environment-based real/stub resolution via `getService(name)`
- On `base-sepolia`: returns stub adapters with deterministic mock data
- On `base`: returns real x402 HTTP adapters using service URLs from env
- 9 service adapters: augur, genvox, slamai-wallet, messari-token-unlocks, messari-allocations, qs-token-security, qs-contract-audit, qs-wallet-risk, qs-whale-activity
- Contract addresses resolved to symbols via CoinGecko before Messari lookup (`src/lib/services/coingecko.ts`)

**Research Cluster Tools** (`src/lib/clusters/`)
Each cluster orchestrates multiple x402 services for cross-referenced intelligence:
- `cluster-a-defi.ts` — `analyze_defi_safety` ($0.05–$0.15)
- `cluster-b-whale.ts` — `track_whale_activity` (~$0.02)
- `cluster-c-portfolio.ts` — `analyze_wallet_portfolio` (~$0.02)
- `cluster-d-social.ts` — `analyze_social_narrative` (~$0.17)
- `cluster-e-alpha.ts` — `screen_token_alpha` (~$0.33)
- `cluster-f-market.ts` — `analyze_market_trends` (~$0.04)
- All clusters emit structured `service_call` + `cluster_complete` JSON telemetry events

**Credit System**
- Anonymous: 2 free calls tracked via session cookie + Neon Postgres (`src/lib/credits/session-store.ts`)
- Wallet users: USDC credit balance with 30% markup on tool costs (`src/lib/credits/credit-store.ts`)
- Spend events recorded per tool call (`src/lib/credits/spend-store.ts`)
- Wallet session restored from `wallet_auth` HttpOnly cookie on page refresh via `/api/auth/me`
- Wallet-age Sybil guard (`src/lib/credits/wallet-age.ts`): queries Basescan for first tx timestamp
  - < 7 days old → $0.10 free credits
  - 7–30 days → $0.25
  - > 30 days → $0.50
  - API failure → $0.10 (safe default)

**Chat API** (`src/app/api/chat/route.ts`)
- Validates messages, filters contentless ones (streaming edge cases)
- Creates MCP client with `withAutoPayment` for 402 handling
- Model fallback chain with cached probes (5-min TTL)
- Records spend events and deducts credits on successful paid tool calls
- Session cookie for anonymous user tracking (30 min expiry)

**Model Fallback** (`src/lib/ai-provider.ts`)
- Probe-based fallback chain: `AI_MODEL` → `deepseek/deepseek-chat` → `google/gemini-2.5-flash`
- Probes are cached for 5 minutes (no latency on repeat requests)
- `invalidateProbe()` called on stream errors for automatic recovery

**Rate Limiting** (`src/lib/rate-limit.ts`, `src/middleware.ts`)
- Upstash Redis sliding window (5 req/min anon, 20 req/min auth for `/api/chat`)
- IP-based free call counter: Redis INCR with 24h TTL, max 2 calls per IP
- Gracefully returns `{ allowed: true }` when no Redis configured

### Environment Configuration

Uses `@t3-oss/env-nextjs` — **env vars are inlined at build time**. Changing env on Vercel requires a redeploy.

See `.env.example` for all keys. Key groups:
- **CDP**: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- **Wallet**: `DEPOSIT_ADDRESS` (CDP purchaser wallet address)
- **AI**: `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`, `AI_MODEL`
- **Database**: `DATABASE_URL` (Neon Postgres)
- **Network**: `NETWORK` (base-sepolia|base), `NEXT_PUBLIC_NETWORK`, `URL`
- **Rate limiting**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Services**: `AUGUR_URL`, `GENVOX_URL`, `SLAMAI_URL`, `QUANTUM_SHIELD_URL`
- Messari (`api.messari.io`) uses hardcoded base URL with `MESSARI_URL` override

## x402 Service Directory

| Service | Base URL | Endpoint | Cost | Used In |
|---------|----------|----------|------|---------|
| Augur | `augurrisk.com` | `/analyze?address=...` | $0.10 | Cluster A, D |
| GenVox | `api.genvox.io` | `/v1/sentiment/{coin}` | $0.03 | Cluster D, F |
| SLAMai | `api.slamai.dev` | `/wallet/trades` | $0.001 | Cluster B, C |
| Messari Unlocks | `api.messari.io` | `/token-unlocks/v1/assets` | free | Cluster A, E |
| Messari Allocations | `api.messari.io` | `/token-unlocks/v1/allocations?assetSymbol=...` | $0.25 (x402 v2) | Cluster E |
| QuantumShield | `quantumshield-api.vercel.app` | `/api/token/security`, `/api/contract/audit`, `/api/wallet/risk`, `/api/whale/activity` | $0.001–$0.003 | All clusters |

## Payment Flow

1. User asks a question that triggers a paid tool
2. AI calls the tool — MCP server returns 402 Payment Required
3. `withAutoPayment` wrapper signs EIP-3009 authorization with house wallet
4. Request retries with Payment header — Coinbase facilitator settles on-chain
5. USDC transfers from house wallet to seller wallet
6. Tool executes and returns result
7. Credit system deducts cost (+ 30% markup) from user's balance

## Network Configuration

- `base-sepolia` (default) - Base testnet, uses stub services with mock data
- `base` - Base mainnet, uses real x402 service URLs from env

Both `NETWORK` and `NEXT_PUBLIC_NETWORK` must match. `NETWORK` is server-side, `NEXT_PUBLIC_NETWORK` is exposed to client for wallet chain switching.

## Deployment

- **Vercel**: `vercel --prod --yes` from repo root
- **Cron**: `/api/credits/check-topups` runs daily (`0 0 * * *`)
- **Build-time env**: Changing env vars on Vercel requires a redeploy (`@t3-oss/env-nextjs` inlines at build)

## Testnet Resources

- Base Sepolia USDC: https://faucet.circle.com/
- Base Sepolia ETH: https://www.alchemy.com/faucets/base-sepolia
- CDP Console: https://portal.cdp.coinbase.com/

## Known Limitations

- **Mid-stream model failure**: If a model dies during streaming, the current request fails. The next request auto-recovers via probe cache invalidation.
- **Google Gemini free tier**: Limited to ~20 req/day. Not suitable as primary model for production traffic.
- **Vercel Hobby plan**: Daily cron only, 60s function timeout (set `maxDuration=120` for Pro compatibility).
