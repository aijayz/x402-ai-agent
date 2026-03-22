# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start development server with Turbopack
pnpm build            # Build for production with Turbopack
pnpm start            # Start production server
pnpm typecheck        # Run TypeScript type checking (no emit)
```

## Architecture Overview

This is an x402 AI Agent — an AI chat app that orchestrates paid research services via HTTP 402 payments on Base. Users get 2 free calls, then connect a wallet to deposit USDC credits.

**Stack:**
- **x402 protocol**: HTTP-native USDC payments on Base blockchain
- **MCP (Model Context Protocol)**: AI tool integration with paid tools
- **AI SDK v6**: Chat with streaming, ToolLoopAgent, `createAgentUIStreamResponse`
- **DeepSeek / Gemini**: AI model providers (configurable via `AI_MODEL` env var)
- **CDP Wallets**: Coinbase-managed house wallet for payment operations
- **Neon Postgres**: Credit system and session tracking
- **Upstash Redis**: Rate limiting (optional, graceful degradation)

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page — hero, research clusters, pricing |
| `/chat` | AI chat interface with suggestion categories |

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/chat` | AI chat endpoint — orchestrator agent with MCP tools |
| `/mcp` | MCP server with paid/free tools |
| `/api/credits/balance` | Get wallet credit balance |
| `/api/credits/topup` | Initiate USDC deposit |
| `/api/credits/topup/confirm` | Confirm deposit transaction |
| `/api/credits/claim` | Claim free credits on wallet connect |
| `/api/credits/check-topups` | Cron job — check pending top-ups |
| `/api/credits/webhook` | Alchemy webhook for deposit confirmation |
| `/api/registry` | x402 service registry API |

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
- 5 services: rug-munch, diamond-claws, wallet-iq, genvox, augur

**Research Cluster Tools** (`src/lib/clusters/`)
- `cluster-a-defi.ts` — `analyze_defi_safety` ($0.12–$2.10)
- `cluster-b-whale.ts` — `track_whale_activity` (~$0.01)
- `cluster-d-social.ts` — `analyze_social_narrative` (~$0.13)
- `cluster-f-solana.ts` — `analyze_market_trends` (~$0.03)

**Credit System**
- Anonymous: 2 free calls tracked via session cookie + Neon Postgres (`src/lib/credits/session-store.ts`)
- Wallet users: USDC credit balance with 30% markup on tool costs (`src/lib/credits/credit-store.ts`)
- Spend events recorded per tool call (`src/lib/credits/spend-store.ts`)

**Chat API** (`src/app/api/chat/route.ts`)
- Validates messages, filters contentless ones (streaming edge cases)
- Creates MCP client with `withAutoPayment` for 402 handling
- Model fallback chain (NOTE: doesn't actually work — streaming errors aren't caught)
- Records spend events and deducts credits on successful paid tool calls
- Session cookie for anonymous user tracking (30 min expiry)

**Rate Limiting** (`src/lib/rate-limit.ts`, `src/middleware.ts`)
- Upstash Redis sliding window (10 req/min for `/api/chat`)
- Gracefully returns `{ allowed: true }` when no Redis configured

**Tool UI** (`src/components/ai-elements/tool.tsx`)
- Compact single-line headers with result snippets (e.g., `✓ Crypto Price · ETH $2,103 · $0.01`)
- 402 payment-negotiation tool cards hidden from users (detected via `isError` + `x402Version` in output)
- Expanded view shows payment proof (tx hash) and raw data
- Tool display config in `src/lib/tool-display-config.ts`

**Cost Display** (`src/components/ai-elements/session-receipt.tsx`)
- Anonymous users: informational pill (`⚡ get crypto price · $0.01 via x402`)
- Wallet users: transactional receipt with per-tool breakdown

### AI Components

UI components in `src/components/ai-elements/`:
- `conversation.tsx` - Container with scroll behavior
- `message.tsx` - Individual message display
- `tool.tsx` - Compact tool headers with result snippets
- `prompt-input.tsx` - Chat input
- `response.tsx` - AI response display with markdown
- `reasoning.tsx` - DeepSeek reasoner thought display
- `loader.tsx` - Loading indicator
- `suggestion.tsx` - Quick suggestion buttons
- `code-block.tsx` - Syntax highlighted code blocks
- `session-receipt.tsx` - Cost display (anonymous vs wallet)

### Environment Configuration

Uses `@t3-oss/env-nextjs` — **env vars are inlined at build time**. Changing env on Vercel requires a redeploy.

See `.env.example` for all keys. Key groups:
- **CDP**: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- **AI**: `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`, `AI_MODEL`
- **Database**: `DATABASE_URL` (Neon Postgres)
- **Network**: `NETWORK` (base-sepolia|base), `URL`
- **Rate limiting**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Services**: `RUGMUNCH_URL`, `AUGUR_URL`, `DIAMONDCLAWS_URL`, `WALLETIQ_URL`, `GENVOX_URL`

## Payment Flow

1. User asks a question that triggers a paid tool
2. AI calls the tool — MCP server returns 402 Payment Required
3. `withAutoPayment` wrapper signs EIP-3009 authorization with house wallet
4. Request retries with Payment header — Coinbase facilitator settles on-chain
5. USDC transfers from house wallet to seller wallet
6. Tool executes and returns result
7. Credit system deducts cost (+ 30% markup) from user's balance
8. UI shows compact tool card with result — 402 error card is hidden

## Network Configuration

- `base-sepolia` (default) - Base testnet, uses stub services
- `base` - Base mainnet, uses real x402 service URLs from env

## Deployment

- **Vercel**: https://x402-ai-agent-kappa.vercel.app
- **Project**: `prj_EmIK8e1f3Rxp4bLcabzRWds6Df3h`
- **Cron**: `/api/credits/check-topups` runs daily (`0 0 * * *`)
- **Deploy**: `vercel --prod --yes` from repo root

## Testnet Resources

- Base Sepolia USDC: https://faucet.circle.com/
- Base Sepolia ETH: https://www.alchemy.com/faucets/base-sepolia
- CDP Console: https://portal.cdp.coinbase.com/

## Current Wallet Addresses (CDP-Managed)

| Wallet | Purpose |
|--------|---------|
| `0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e` | Purchaser (pays for tools) |
| `0x545442553E692D0900005d7e48885684Daa0C4f0` | Seller (receives payments) |
