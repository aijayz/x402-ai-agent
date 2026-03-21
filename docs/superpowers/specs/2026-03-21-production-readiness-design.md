# Production Readiness Design Spec

## Overview

Make the x402 AI Agent production-ready across 5 workstreams: wire up real x402 services, clean up tool result UI, add rate limiting, build a landing page, and split staging/production environments. The goal is a deployable product where staging runs on Base Sepolia with stubs and production runs on Base mainnet with real paid services.

## Principles

- Only pay for proprietary intelligence we can't get free. Keep free MCP tools for prices, wallets, URLs, contracts, images.
- Maintain all 4 cluster categories (even with stubs) for easier Phase 2 integration.
- No over-engineering. Environment switching via a single `NETWORK` env var, no feature flags.

---

## 1. Service Layer Architecture

### Core Abstraction

Each external x402 service gets an adapter implementing a common interface:

```typescript
interface X402ServiceResponse<T> {
  data: T;
  cost: number;        // actual USDC spent
  source: string;      // service name for attribution
  cached?: boolean;
}

interface X402ServiceAdapter<TInput, TOutput> {
  name: string;
  baseUrl: string;
  estimatedCost: number;
  call(input: TInput, paymentContext: PaymentContext): Promise<X402ServiceResponse<TOutput>>;
}
```

### File Structure

```
src/lib/services/
├── types.ts                    # X402ServiceAdapter interface, PaymentContext
├── registry.ts                 # Maps service names → adapters by env, reads URLs from env.ts
├── payment-handler.ts          # Shared x402 HTTP+402 flow (wraps x402Fetch pattern)
├── adapters/
│   ├── rug-munch.ts           # DeFi safety scoring
│   ├── diamond-claws.ts       # Token metrics
│   ├── wallet-iq.ts           # Wallet profiling
│   ├── genvox.ts              # Social sentiment
│   ├── augur.ts               # Prediction markets
│   └── stubs/
│       ├── rug-munch.stub.ts  # Realistic mock data
│       ├── diamond-claws.stub.ts
│       ├── wallet-iq.stub.ts
│       ├── genvox.stub.ts
│       └── augur.stub.ts
└── index.ts                    # getService(name) → real or stub based on env
```

### Resolution Logic

`getService("rug-munch")` checks `env.NETWORK`:
- `base-sepolia` → returns stub adapter
- `base` → returns real adapter

### Payment Handler

A shared `callWithPayment(url, body, paymentContext)` function handles the x402 HTTP payment flow for direct service calls: request → 402 response → sign EIP-3009 authorization → retry with Payment header.

**Important distinction:** The codebase has two payment paths:
1. **MCP tool payments** — handled by `withPayment()` in `src/lib/with-auto-payment.ts`, which wraps MCP client calls and injects payment into `_meta` fields. Used by the existing MCP paid tools (prices, images, etc.).
2. **Direct HTTP service payments** — handled by `x402Fetch()` (used in existing cluster files like `cluster-f-solana.ts`), which makes direct HTTP calls and handles 402 responses.

The new `payment-handler.ts` wraps the `x402Fetch` pattern (not the MCP `withPayment`), providing a typed wrapper that cluster service adapters call. `PaymentContext` contains the wallet client and user wallet address needed to sign EIP-3009 authorizations:

```typescript
interface PaymentContext {
  walletClient: WalletClient;
  userWallet: string | null;
}
```

---

## 2. x402 Service Integration (4 Clusters)

Each cluster tool orchestrates 2-3 services and synthesizes results. Existing cluster files (`cluster-a-defi.ts`, `cluster-b-whale.ts`, `cluster-d-social.ts`, `cluster-f-solana.ts`) are refactored to use the service layer instead of direct HTTP calls.

### Cluster A: DeFi Research (`analyze_defi_safety`)

| Service | Cost | Purpose |
|---------|------|---------|
| Rug Munch | $0.02-2.00 | Rug pull detection, contract risk scoring |
| DiamondClaws | $0.0005-0.002 | Token metrics, holder distribution |
| Augur | $0.10 | Prediction market sentiment on the token |

**Synthesis:** Combined safety score (0-100), risk factors list, holder concentration, market sentiment. Orchestration value: correlating contract risk with holder behavior and market prediction.

**Estimated total:** $0.12-2.10 per call (tiered by depth).

### Cluster B: Whale Tracking (`track_whale_activity`)

| Service | Cost | Purpose |
|---------|------|---------|
| WalletIQ | $0.005 | Wallet profiling, historical activity |
| DiamondClaws | $0.001 | Token flow data for tracked wallet |

**Synthesis:** Smart money movements, wallet classification (whale/fund/MEV bot), recent significant trades with context.

**Estimated total:** ~$0.01 per call.

### Cluster D: Social Sentiment (`analyze_social_narrative`)

| Service | Cost | Purpose |
|---------|------|---------|
| GenVox | $0.03 | Twitter/Farcaster sentiment aggregation |
| Augur | $0.10 | Prediction market correlation |

**Synthesis:** Narrative summary, sentiment score, social momentum vs market prediction alignment/divergence.

**Estimated total:** ~$0.13 per call.

### Cluster F: Market Intelligence (`analyze_market_trends`)

Renamed from `analyze_solana_staking` — Solana staking was too narrow for a general market intelligence tool. The existing `STAKEVIA_URL` and `MYCELIA_URL` env vars in `env.ts` are removed as part of this refactor, since those services are replaced by GenVox and DiamondClaws.

| Service | Cost | Purpose |
|---------|------|---------|
| GenVox | $0.03 | Trending narratives |
| DiamondClaws | $0.001 | Token metrics for trending assets |

**Synthesis:** Market trend report, emerging narratives with supporting token data.

**Estimated total:** ~$0.03 per call.

### Service Availability Handling

When a real service is unreachable on mainnet, the cluster tool returns partial results from whichever services responded, with a note about what's missing. No silent failures — the user sees "Rug Munch data included, WalletIQ temporarily unavailable."

### Stub Behavior

Each stub returns realistic, varied mock data. Stubs use a simple string-hash of the input (e.g., sum of char codes mod N) to select from a pool of mock responses — same token address always returns same mock result. Do not use `Math.random()` (not seedable); a deterministic hash function is required.

---

## 3. Tool UI Cleanup

### Problem

Tool calls currently show raw JSON output, technical error messages, and internal tool names to users. Most tools fall through to `JSON.stringify(output)`.

### Design

#### Default Behavior Change

No raw JSON ever shown to users. The default fallback becomes a simple status label ("Completed" / "Running..." / "Error") instead of stringified JSON. The AI's text response is the primary way users see results — the tool card is supplementary.

#### Tool Card States

1. **Running:** Human-friendly tool name + spinner. E.g., "Analyzing DeFi Safety..." not "analyze_defi_safety"
2. **Completed:** Human-friendly name + brief result summary. E.g., "DeFi Safety Analysis — Risk Score: 35/100"
3. **Error:** Human-friendly name + "Temporarily unavailable" (no stack traces, no HTTP codes)
4. **Payment:** Keep existing payment badge, simplify to "$0.12 paid" by default

#### Tool Name Mapping

New `src/lib/tool-display-config.ts` — a `Record<string, { label: string, icon: string }>` mapping internal tool IDs to display names and Lucide icon names.

Example:
- `analyze_defi_safety` → `{ label: "DeFi Safety Analysis", icon: "Shield" }`
- `get_crypto_price` → `{ label: "Crypto Price", icon: "TrendingUp" }`
- `track_whale_activity` → `{ label: "Whale Tracker", icon: "Fish" }`

#### Result Renderers

Extend `renderToolSpecificOutput` in `tool.tsx` to cover all tools:
- **Cluster tools:** Render synthesized results as structured cards (safety scores, sentiment charts, wallet profiles)
- **MCP paid tools:** Render formatted results (prices as currency, images as thumbnails, URLs as link previews)
- **Free tools:** Minimal display — result is in the AI's text response

#### Collapsible Raw Data

A small "Show raw data" toggle at the bottom of any tool card, collapsed by default. Only for debugging/power users.

#### Files

- `src/components/ai-elements/tool.tsx` — Main refactor: default to clean rendering, expand `renderToolSpecificOutput`
- `src/lib/tool-display-config.ts` — New: tool name/icon mapping

---

## 4. Rate Limiting

### Stack

Upstash Redis + `@upstash/ratelimit` in Next.js middleware.

### Limits

| Tier | Key | Chat API | MCP endpoint | Landing page |
|------|-----|----------|-------------|--------------|
| Anonymous | IP address | 5 req/min | 10 req/min | 30 req/min |
| Authenticated | Wallet address | 20 req/min | 40 req/min | No limit |

### Implementation

**Middleware** (`src/middleware.ts`): Currently a pass-through. Add rate limiting check before request proceeds.

**Key extraction:** Check `x-wallet-address` header (set by frontend for authenticated users) → wallet-based limit. Fallback to `x-forwarded-for` or `request.ip` → IP-based limit.

**Header spoofing caveat:** The `x-wallet-address` header is set by the frontend and not cryptographically verified in the middleware. A malicious user could spoof this header to get authenticated-tier limits. This is an accepted limitation for now — the rate limit tiers are close enough that spoofing provides minimal benefit (20 vs 5 req/min). The real auth gate is the credit system: spoofing the header doesn't grant credits or spending ability. Phase 2 can add signed-challenge verification if abuse is observed.

**Route matching:** Different limits for `/api/chat`, `/mcp`, and everything else. Simple path prefix check.

**429 Response:** Return `429 Too Many Requests` with `Retry-After` header and JSON body: `{ error: "Rate limit exceeded", retryAfter: 30 }`.

**Frontend handling:** Chat component catches 429 and shows inline message: "You're sending messages too quickly. Please wait a moment." No modal, no redirect.

### Environment Variables

- `UPSTASH_REDIS_REST_URL` — provisioned via Vercel Marketplace
- `UPSTASH_REDIS_REST_TOKEN` — provisioned via Vercel Marketplace
- Rate limiting is disabled if these env vars are missing (local dev works without Redis).

### Files

- `src/middleware.ts` — Add rate limiting logic
- `src/lib/rate-limit.ts` — Thin wrapper around `@upstash/ratelimit` with tier/route config
- Chat page component — Handle 429 responses in UI

---

## 5. Landing Page & Routing

### Route Restructure

| Route | Content |
|-------|---------|
| `/` | Landing page (new) |
| `/chat` | Chat app (moved from current `/`) |
| `/api/chat`, `/mcp`, `/api/credits/*` | Stay where they are |

### Landing Page Design

Single file at `src/app/page.tsx`. Four sections:

1. **Hero:** Headline ("AI agent that pays for intelligence"), subtext explaining x402 in plain language, primary CTA → `/chat`, secondary CTA → x402.org
2. **Features grid:** 4 cards matching cluster categories — DeFi Safety Analysis, Whale Tracking, Social Sentiment, Market Intelligence. Each: icon, title, one-line description, example cost.
3. **Pricing:** 2-column layout — Free tier (2 free calls, basic tools) vs Credit tier (connect wallet, deposit USDC, all clusters + research tools).
4. **Footer:** Links to x402.org, GitHub repo, Base network.

### Chat Page

Move current `src/app/page.tsx` → `src/app/chat/page.tsx`.

**Layout restructure:** The current root `layout.tsx` renders chat-specific UI (header with `WalletPill`, `CreditBadge`, wallet providers). This must be split:
- **Root `layout.tsx`** — Slim: html/body, theme provider, fonts, metadata. No chat-specific UI.
- **`src/app/chat/layout.tsx`** — Required (not optional): wallet providers, header with WalletPill/CreditBadge, chat-specific context providers.
- **Landing page (`src/app/page.tsx`)** — Has its own simple header (logo + "Launch App" CTA). No wallet providers needed.

### Navigation

- Landing page header: Logo + "Launch App" button → `/chat`
- Chat page header: Existing header + logo click → `/`
- No redirect from `/` → `/chat`. Users arriving at `/` see the landing page and click through. This is intentional — the landing page is the new front door.

### Files

- `src/app/page.tsx` — Replace with landing page
- `src/app/layout.tsx` — Slim down: remove chat-specific header, wallet providers
- `src/app/chat/page.tsx` — Current chat page moved here
- `src/app/chat/layout.tsx` — Required: wallet providers, chat header, credit badge

---

## 6. Environment Split (Staging/Production)

### Environment Resolution

Single env var `NETWORK` controls everything:
- `base-sepolia` → staging (testnet, stubs, faucet-funded wallets)
- `base` → production (mainnet, real services, real USDC)

No separate `.env.staging` / `.env.production` files. Vercel environment variables handle per-deployment config.

### What Changes Per Environment

| Concern | `base-sepolia` (staging) | `base` (production) |
|---------|------------------------|---------------------|
| x402 services | Stub adapters (mock data) | Real adapters (HTTP calls) |
| MCP paid tools | Real calls (testnet USDC) | Real calls (mainnet USDC) |
| CDP wallets | Testnet wallets, auto-faucet | Mainnet wallets, real funds |
| Rate limiting | Same limits | Same limits |
| Free tier credits | $0.50 test credits | $0.50 real credits (same amount — intentional) |
| RPC URLs | Base Sepolia RPC | Base mainnet RPC |

### Service URL Config

Service URLs are defined as optional env vars in `src/lib/env.ts` (consistent with existing pattern — the codebase already has `RUGMUNCH_URL`, `AUGUR_URL`, etc. defined there via `@t3-oss/env-nextjs`). The registry reads URLs from `env.*`, not from a separate config file. No new `config.ts` needed — `registry.ts` handles the mapping:

```typescript
// In registry.ts
import { env } from "@/lib/env";

const serviceUrls: Record<string, string | undefined> = {
  "rug-munch": env.RUGMUNCH_URL,
  "diamond-claws": env.DIAMONDCLAWS_URL,
  "wallet-iq": env.WALLETIQ_URL,
  "genvox": env.GENVOX_URL,
  "augur": env.AUGUR_URL,
};
```

New service URL env vars (`GENVOX_URL`, `DIAMONDCLAWS_URL`) are added to `env.ts` as `.optional()`. Existing unused vars (`STAKEVIA_URL`, `MYCELIA_URL`) are removed.

### Deployment

- **Staging:** Vercel preview deployments (every PR) + pinned staging URL. `NETWORK=base-sepolia`.
- **Production:** Vercel production deployment on merge to main. `NETWORK=base`.
- Same codebase, same build — only env vars differ.

### No Feature Flags

The `NETWORK` env var is the only switch. No LaunchDarkly, no Edge Config.

---

## Dependencies & New Packages

| Package | Purpose |
|---------|---------|
| `@upstash/ratelimit` | Rate limiting algorithm |
| `@upstash/redis` | Redis client for rate limiter |

No other new packages required.

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/lib/services/types.ts` | Service adapter interface, PaymentContext type |
| `src/lib/services/registry.ts` | Service name → adapter resolution by env |
| `src/lib/services/payment-handler.ts` | Shared x402 HTTP+402 payment flow |
| `src/lib/services/index.ts` | `getService()` entry point |
| `src/lib/services/adapters/rug-munch.ts` | Rug Munch real adapter |
| `src/lib/services/adapters/diamond-claws.ts` | DiamondClaws real adapter |
| `src/lib/services/adapters/wallet-iq.ts` | WalletIQ real adapter |
| `src/lib/services/adapters/genvox.ts` | GenVox real adapter |
| `src/lib/services/adapters/augur.ts` | Augur real adapter |
| `src/lib/services/adapters/stubs/rug-munch.stub.ts` | Rug Munch stub |
| `src/lib/services/adapters/stubs/diamond-claws.stub.ts` | DiamondClaws stub |
| `src/lib/services/adapters/stubs/wallet-iq.stub.ts` | WalletIQ stub |
| `src/lib/services/adapters/stubs/genvox.stub.ts` | GenVox stub |
| `src/lib/services/adapters/stubs/augur.stub.ts` | Augur stub |
| `src/lib/tool-display-config.ts` | Tool name/icon mapping |
| `src/lib/rate-limit.ts` | Rate limiter wrapper |
| `src/app/chat/page.tsx` | Chat page (moved) |
| `src/app/chat/layout.tsx` | Chat-specific layout |

### Modified Files

| File | Change |
|------|--------|
| `src/app/page.tsx` | Replace with landing page |
| `src/app/layout.tsx` | Slim down: remove chat-specific header/providers |
| `src/middleware.ts` | Add rate limiting |
| `src/components/ai-elements/tool.tsx` | Tool UI cleanup, expand renderers |
| `src/app/chat/page.tsx` | Handle 429 rate limit responses in chat UI |
| `src/lib/clusters/cluster-a-defi.ts` | Use service layer |
| `src/lib/clusters/cluster-b-whale.ts` | Use service layer |
| `src/lib/clusters/cluster-d-social.ts` | Use service layer |
| `src/lib/clusters/cluster-f-solana.ts` | Rename tool, use service layer |
| `src/lib/agents/orchestrator.ts` | Update tool names/descriptions |
| `src/lib/env.ts` | Add Upstash env vars (optional), add new service URLs, remove STAKEVIA_URL/MYCELIA_URL |

## Out of Scope

- Cross-chain deposits (Phase 2)
- Agent marketplace/registry (Phase 3)
- Bazaar integration (Phase 2)
- Bitrefill/Laso real-world spending (Phase 2)
- Database migrations for credit system changes
- Authentication beyond wallet connect
