# Orchestrated x402 AI Agent — Phase 1 Design Spec

> Date: 2026-03-19
> Status: Approved for implementation planning
> Supersedes: Initial business model brainstorm (`2026-03-19-x402-business-model-analysis.md`)

---

## 1. Problem Statement

The current x402-ai-agent is a server-subsidized demo. The server pays for all tool calls, users pay nothing, and there is no revenue. The goal of Phase 1 is to transform it into a self-sustaining product with real revenue by:

1. Delegating to high-value external x402 services that solve real user problems
2. Charging users via a credit system with a compelling free tier
3. Adding a markup on every delegated call

---

## 2. Core Product Vision

An AI chat agent that answers high-value crypto research questions by orchestrating a curated set of external x402 services. Users get 2 free tool calls anonymously, then connect a wallet to claim $0.50 in free credits. When depleted, they top up with any crypto.

**The hook:** "Analyze any token, wallet, or market trend — 2 free analyses on us."

**The business:** 20–30% markup on every x402 service call routed through the platform.

---

## 3. Service Clusters (Phase 1)

> **Cluster naming note:** Clusters are labeled A, B, D, F intentionally. C (Real-World Purchases) and E (Multi-Model LLM Inference) are deferred to Phase 2 — C requires user trust and API validation, E is wired in as background infrastructure (BlockRun). The gap in letters is deliberate to preserve continuity with the business model analysis doc.

### Cluster A — DeFi Safety & Due Diligence
**User intent:** "Is this token/contract/wallet safe?"

| Service | Price | What it provides |
|---------|-------|-----------------|
| Rug Munch Intelligence | $0.02–$2.00 | Token rug pull/honeypot detection across 6+ chains, 240K+ historical scans |
| Augur | $0.10 | Smart contract bytecode risk score (0–100), deterministic findings |
| DiamondClaws | $0.001 | Yield scoring, protocol risk, 17K+ pools, 7K+ protocols |
| WalletIQ | $0.005 | Wallet age, activity, DeFi usage, risk scoring across 5+ chains |

**Example session cost:** $0.12–$0.50 · **Charged to user:** $0.15–$0.65 (30% markup)

### Cluster B — Whale & Smart Money Intelligence
**User intent:** "What are smart wallets/whales buying right now?"

| Service | Price | What it provides |
|---------|-------|-----------------|
| Einstein AI | unknown — pre-call price check required | Whale tracking, smart money signals, DEX analytics, MEV detection |
| SLAMai | unknown — pre-call price check required | Smart money intelligence, open APIs with MCP layer |
| Mycelia Signal | $0.001 × up to 7 | Cryptographically signed price feeds (BTC, ETH, SOL, EUR, XAU) |

**Example session cost:** ~$0.05–$0.15 · **Charged to user:** ~$0.07–$0.20

### Cluster D — Web3 Social & Narrative Intelligence
**User intent:** "What's the market narrative / what are people saying about X?"

| Service | Price | What it provides |
|---------|-------|-----------------|
| twit.sh | micropayment | Real-time Twitter/X data, no API key needed |
| Neynar | micropayment | Farcaster social graph and cast data |
| Firecrawl | micropayment | Web scraping → LLM-ready structured content |

**Example session cost:** ~$0.03–$0.10 · **Charged to user:** ~$0.04–$0.13

### Cluster F — Solana Staking Intelligence
**User intent:** "Where should I stake my SOL for best returns and safety?"

| Service | Price | What it provides |
|---------|-------|-----------------|
| Stakevia | $1.00 | AI-powered validator scoring, risk analysis, stake simulations for 1,000+ validators |
| Mycelia Signal | $0.001 | Current SOL price feed |

**Example session cost:** ~$1.001 · **Charged to user:** ~$1.25 (25% markup)

### Background Infrastructure (not user-visible)
- **BlockRun.AI** — Multi-LLM gateway (30+ models, provider cost + 5%). Used as cost optimizer for sub-tasks: summarization, classification, translation. Orchestrator routes cheap reasoning tasks here, charges users cost + 15%.

---

## 4. User Credit System

### Free Tier (Anti-Abuse Design)

**Stage 1 — Anonymous:** User gets 2 free tool calls with no wallet required. Enough to experience real value.

**Stage 2 — Wallet-gated $0.50:** After 2 calls, user is prompted to connect wallet. On connect:
1. Check DB: has this wallet address already claimed free credits? If yes, skip.
2. Call WalletIQ ($0.005) to check wallet age/activity as Sybil guard:
   - Wallet age < 7 days → grant $0.10
   - Wallet age 7–30 days → grant $0.25
   - Wallet age > 30 days → grant $0.50
3. Credit balance stored in DB, keyed to wallet address.

**Stage 3 — Paid:** When balance depleted, user tops up with any crypto (Phase 1: USDC on Base; Phase 2: any chain via swap).

### Credit Balance Mechanics

- Credits stored in platform database (custodial) keyed to wallet address
- House CDP wallet settles all x402 payments on behalf of users
- BudgetController (existing) evolves from session-based to wallet-account-based
- Credits are non-refundable (like OpenAI credits)
- No expiry in Phase 1

### Top-Up (Phase 1)
- USDC on Base only (direct transfer to house wallet address)
- Minimum top-up: $1.00
- UI shows wallet address + QR code to send USDC
- Balance updates after on-chain confirmation (~200ms on Base)

### Top-Up (Phase 2)
- Any EVM chain via thirdweb Pay (cross-chain swap to USDC on Base)
- Solana SOL/USDC via bridge
- Multi-chain deposit UX

---

## 5. Orchestrator Behavior

### Intent Classification
The orchestrator agent reads the user message and classifies intent into one or more clusters:

```
"Is this contract safe?" → Cluster A
"What are whales buying?" → Cluster B
"What's trending on Farcaster?" → Cluster D
"Best validators for my SOL?" → Cluster F
"Analyze this token end-to-end" → Clusters A + B + D (combined)
```

### Cost Transparency Rules

| Call cost | Behavior |
|-----------|----------|
| < $0.10 | Auto-approve, call immediately |
| $0.10–$0.50 | Show estimated cost, auto-proceed after 2s with option to cancel |
| > $0.50 | Explicit confirmation required: "This will use ~$X. Proceed?" |
| Unknown cost (Einstein AI, SLAMai, twit.sh, Neynar) | Read `maxAmountRequired` from the 402 response before proceeding. Apply the same thresholds above against the actual max amount. |

### Variable-Cost Services & Overdraft Policy

Some services have variable pricing (e.g., Rug Munch $0.02–$2.00 depending on scan depth). To prevent the user's balance going negative:

- **Reserve the maximum** upfront before calling the service (e.g., reserve $2.00 for Rug Munch)
- On settlement, actual cost is read from the x402 payment response and only that amount is deducted
- Unreserved amount is released back to the balance immediately after the call
- If actual cost exceeds reserved amount (should not happen with x402's `maxAmountRequired` contract, but as a safeguard): allow overdraft up to $0.10; above that, reject and refund the reservation

### Minimum Service Selection
Orchestrator calls the minimum set of services needed. For "is this token safe?":
- Always: Rug Munch (core detection) + Augur (contract score) = ~$0.12
- If contract is flagged: add DiamondClaws for deeper protocol analysis
- If user asks about a wallet: add WalletIQ

Never call all services in a cluster by default — let the orchestrator decide based on what's actually needed.

### Session Receipt
After each conversation turn that involved paid tool calls, show an itemized breakdown:
```
Used this session:
  Rug Munch scan    $0.026
  Augur audit       $0.13
  ─────────────────────
  Total             $0.156
  Balance remaining $0.344
```

---

## 6. Credit Balance Precision

Store all credit balances as **integer microdollars** (1 USDC = 1,000,000 units). Example: $0.50 = 500,000. All arithmetic in the credit store operates on integers. Only convert to decimal for display in the UI. This avoids JavaScript floating-point precision errors on financial calculations.

## 7. Architecture

### Components

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          ← Orchestrator (extend existing)
│   │   └── credits/
│   │       ├── claim/route.ts     ← POST: wallet connect → claim free credits
│   │       └── topup/route.ts     ← POST: initiate top-up, return deposit address
│   └── mcp/route.ts               ← Existing MCP server (keep current paid tools)
├── lib/
│   ├── accounts.ts                ← Existing CDP wallets (unchanged)
│   ├── budget-controller.ts       ← Extend: wallet-account-based instead of session-based
│   ├── with-auto-payment.ts       ← Existing (unchanged)
│   ├── credits/
│   │   ├── credit-store.ts        ← CRUD for credit balances (DB-backed)
│   │   └── free-tier.ts           ← Free tier claim logic + WalletIQ Sybil check
│   └── clusters/
│       ├── cluster-a-defi.ts      ← DeFi safety orchestration (RugMunch + Augur + etc.)
│       ├── cluster-b-whale.ts     ← Whale intel orchestration
│       ├── cluster-d-social.ts    ← Social intel orchestration
│       └── cluster-f-solana.ts    ← Solana staking orchestration
└── components/
    └── ai-elements/
        └── credit-display.tsx     ← Credit balance + top-up prompt
```

### Data Model

```typescript
// Credit balance record
type CreditAccount = {
  walletAddress: string       // Primary key (checksummed)
  balanceUsdc: number         // Current balance in USDC (e.g., 0.344)
  lifetimeSpent: number       // Total spent, for analytics
  freeCreditsGranted: boolean // Has this wallet received free credits?
  freeCreditsAmount: number   // How much free credit was granted
  createdAt: Date
  updatedAt: Date
}

// Anonymous session (before wallet connect)
type AnonymousSession = {
  sessionId: string           // Cookie-based
  freeCallsUsed: number       // Max 2 before wallet prompt
  createdAt: Date
}

// Spend event (for receipts and analytics)
type SpendEvent = {
  walletAddress: string
  toolName: string            // e.g. "rug_munch_scan"
  serviceCost: number         // What we paid the x402 provider
  chargedAmount: number       // What we charged the user (with markup)
  markup: number              // e.g. 0.30 = 30%
  txHash: string              // On-chain settlement tx
  createdAt: Date
}
```

### Payment Flow

```
User asks question
  → Orchestrator classifies intent
  → Checks user credit balance
  → If balance < estimated cost: show top-up prompt
  → If balance sufficient:
      → For each service call:
          1. Orchestrator calls x402 service (no payment header)
          2. Service returns 402 with payment requirements
          3. withAutoPayment intercepts → house CDP wallet signs EIP-3009
          4. Service executes, returns result
          5. Deduct (service cost × (1 + markup)) from user credit balance DB
             e.g. RugMunch costs $0.02 → deduct $0.02 × 1.30 = $0.026
          6. Record SpendEvent
      → Synthesize all results
      → Return response with session receipt
```

---

## 8. Revenue Model

| Item | Cost | Charge | Margin |
|------|------|--------|--------|
| Rug Munch scan | $0.02 | $0.026 | 30% |
| Augur audit | $0.10 | $0.13 | 30% |
| DiamondClaws query | $0.001 | $0.0013 | 30% |
| WalletIQ lookup | $0.005 | $0.0065 | 30% |
| Mycelia price feed | $0.001 | $0.0013 | 30% |
| Stakevia report | $1.00 | $1.25 | 25% |
| BlockRun LLM call | cost+5% | cost+15% | ~10% net |
| **Typical DeFi safety session** | ~$0.15 | ~$0.20 | ~30% |
| **Typical whale intel session** | ~$0.08 | ~$0.10 | ~25% |
| **Solana staking report** | ~$1.00 | ~$1.25 | ~25% |

Unit economics: at $0.20 average revenue per session and 30% margin, each session nets ~$0.06. At 1,000 sessions/day that's $60/day, $1,800/month from session revenue alone.

---

## 9. What Changes vs. Current Codebase

| Component | Current | Phase 1 |
|-----------|---------|---------|
| `BudgetController` | Session-based, $0.50 limit | Wallet-account-based, credit balance |
| CDP Purchaser wallet | Server pays everything | House wallet pays on behalf of credited users |
| MCP tools (mcp/route.ts) | Current 5 tools | Keep + add cluster tools as MCP tools |
| Chat API | Single session budget | Credit balance check + deduction per call |
| Frontend | No wallet connect | Add wallet connect + credit balance display |
| Auth/identity | Session cookie only | Session cookie (anon) + wallet address (paid) |

---

## 10. Out of Scope (Phase 1)

- Multi-chain deposit (Phase 2) — Phase 1 accepts USDC on Base only
- Real-world purchases via Laso/Bitrefill (Phase 2) — requires user trust + API validation
- Agent-to-agent registry (Phase 3) — requires Phase 1 demand signal first
- Fiat on-ramp / Stripe (never in core product) — not aligned with x402 thesis
- Smart contract escrow for credits — custodial DB is sufficient for Phase 1

---

## 11. Scalability & Deployment

### Deployment Target
Vercel (primary) — but the solution is ~95% host-neutral. Core stack (Next.js + Neon + CDP + x402) runs identically on Railway, Fly.io, or bare VPS. Two Vercel-specific touchpoints are surface-level:
- `vercel.json` crons → replaceable with node-cron or any external scheduler
- `export const maxDuration` → Vercel-specific, remove on other hosts

**Constraint:** Never use `@vercel/kv`, `@vercel/blob`, or Edge Config for credit data — those are Vercel-locked. Neon Postgres keeps the data layer portable.

### Deployment Structure
```
Vercel (serverless, auto-scales)
├── Next.js app
│   ├── /api/chat              → Orchestrator (stateless, scales horizontally)
│   ├── /api/credits/claim     → Free tier claim + WalletIQ Sybil check
│   ├── /api/credits/topup     → Returns house wallet address for deposit
│   ├── /api/credits/webhook   → Alchemy webhook receiver for USDC transfers
│   └── /mcp                   → Existing MCP server (unchanged)
│
├── Vercel Cron (every 60s)
│   └── /api/credits/check-topups   → Fallback polling for missed webhooks
│
├── Neon Postgres
│   ├── credit_accounts        → wallet balances (integer microdollars)
│   ├── anonymous_sessions     → anon free tier (replaces in-memory Map)
│   └── spend_events           → audit log
│
└── External Services
    ├── CDP API                → house wallet signing
    ├── Alchemy                → Base RPC + USDC transfer webhooks
    └── x402 providers         → RugMunch, Augur, Stakevia, twit.sh, etc.
```

### Concurrency & Race Conditions

**House wallet:** Single CDP wallet is sufficient for Phase 1 (< ~50 concurrent calls). Plan wallet pool when consistently hitting > 20 concurrent users.

**Credit balance deductions:** Use Postgres atomic UPDATE to prevent race conditions:
```sql
UPDATE credit_accounts
SET balance_micro_usdc = balance_micro_usdc - $amount
WHERE wallet_address = $address
  AND balance_micro_usdc >= $amount
RETURNING balance_micro_usdc
-- 0 rows returned = insufficient balance, reject the call
```

**Variable-cost reservation:** Reserve `maxAmountRequired` before calling a service. Release unused reservation after settlement.

**Session state:** Replace in-memory `sessionStore` Map with `anonymous_sessions` table in Neon. Required for correctness on serverless (each invocation is stateless, may hit different instance).

### Top-Up Detection
Primary: Alchemy webhook registered for USDC `Transfer` events to house wallet address on Base. Alchemy calls `/api/credits/webhook` with transfer details. Near-instant (~1–2s after on-chain confirmation).

Fallback: Vercel Cron queries Base RPC every 60s for recent USDC transfers. Catches any webhooks missed during downtime.

### External Service Reliability
All x402 service calls have an 8-second timeout. On timeout or error, orchestrator continues with available results and informs the user which service was unavailable. Never block the full response for one failing provider.

### DB Schema Additions
```sql
CREATE TABLE anonymous_sessions (
  session_id TEXT PRIMARY KEY,
  free_calls_used INTEGER NOT NULL DEFAULT 0,  -- max 2
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup of old sessions
CREATE INDEX ON anonymous_sessions (created_at);
```

## 12. Open Questions

1. **Database choice:** Which DB for credit balances? Existing codebase has no DB — need to pick one (Neon Postgres recommended for Vercel deployment).
2. **House wallet treasury:** If many users spend simultaneously, house wallet could run low on USDC. Need auto-replenish logic or monitoring + alerts.
3. **x402 service reliability:** Rug Munch, Stakevia, DiamondClaws — all early-stage. Need fallback behavior when they return errors or are unavailable.
4. **Markup disclosure:** Should users see the markup or just the "platform price"? Transparent pricing builds trust but exposes margin.
5. **MCP tool wrapping (resolved):** Cluster services are called **directly from the orchestrator** via their x402 HTTP endpoints, not wrapped as MCP tools. Reason: each cluster module manages its own service selection logic (calling 2–4 services per cluster based on context), which doesn't map cleanly to single MCP tool calls. The existing `withAutoPayment` wrapper is used in each cluster module directly. The `/mcp` route keeps the current 5 demo tools unchanged.

6. **Top-up confirmation (resolved):** Use `viem watchContractEvent` to listen for USDC `Transfer` events on Base where `to === houseWalletAddress`. On event receipt, credit the sender's balance in the DB. This runs as a long-lived Next.js background task (or a separate lightweight process). No third-party indexer required for Phase 1.
