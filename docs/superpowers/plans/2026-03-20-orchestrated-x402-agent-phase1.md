# Orchestrated x402 Agent — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the x402 demo into a self-sustaining product with a credit system, external x402 service orchestration, wallet-gated free tier, and USDC top-ups — all backed by Neon Postgres.

**Architecture:** Neon Postgres stores credit accounts (integer microdollars), anonymous sessions, and spend events. The chat route evolves from session-based budget to wallet-account-based credits. A generic `x402Fetch` helper calls external x402 services directly over HTTP. Cluster modules (A/B/D/F) wrap multi-service orchestration as local AI SDK tools. The house CDP wallet settles all x402 payments; user credit balances are debited with a 25-30% markup.

**Tech Stack:** Next.js 15, AI SDK v6 (ToolLoopAgent), @neondatabase/serverless, x402/client (createPaymentHeader), CDP SDK, viem, Zod.

**Spec:** `docs/superpowers/specs/2026-03-19-orchestrated-x402-agent-design.md`

---

## Scope & Phase Overview

| Phase | Name | Purpose | Depends On |
|-------|------|---------|------------|
| 1 | Database Foundation | Neon Postgres schema, credit/session/event stores | — |
| 2 | Session & Credit Integration | Replace in-memory sessions, wire credits into chat | Phase 1 |
| 3 | Credit APIs | Claim, top-up, webhook, cron endpoints | Phase 1 |
| 4 | x402 Client & Cluster Modules | Generic x402 HTTP client, cluster A/B/D/F tools | Phase 2 |
| 5 | Frontend | Wallet connect, credit display, cost transparency, top-up UI | Phases 2+3 |

Phases 3 and 4 are independent and can be parallelized after Phase 2.
Phase 5 depends on both 2 and 3 (needs credit APIs + chat integration).

---

## File Map

| File | Action | Phase |
|------|--------|-------|
| `src/lib/db.ts` | Create — Neon client singleton | 1 |
| `src/lib/db-schema.sql` | Create — DDL for all tables | 1 |
| `src/lib/credits/credit-store.ts` | Create — credit account CRUD (integer microdollars) | 1 |
| `src/lib/credits/session-store.ts` | Create — anonymous session CRUD | 1 |
| `src/lib/credits/spend-store.ts` | Create — spend event logging | 1 |
| `src/lib/__tests__/credit-store.test.ts` | Create — unit tests | 1 |
| `src/lib/__tests__/session-store.test.ts` | Create — unit tests | 1 |
| `src/lib/env.ts` | Modify — add DATABASE_URL | 1 |
| `.env.example` | Modify — add DATABASE_URL | 1 |
| `src/app/api/chat/route.ts` | Modify — replace in-memory sessions, add credit flow | 2 |
| `src/lib/budget-controller.ts` | Modify — add credit-based mode | 2 |
| `src/app/api/credits/claim/route.ts` | Create — wallet connect → free credits | 3 |
| `src/app/api/credits/topup/route.ts` | Create — return house wallet address | 3 |
| `src/app/api/credits/webhook/route.ts` | Create — Alchemy USDC transfer webhook | 3 |
| `src/app/api/credits/check-topups/route.ts` | Create — cron fallback polling | 3 |
| `vercel.json` | Create — cron config | 3 |
| `src/lib/__tests__/spend-store.test.ts` | Create — unit tests | 1 |
| `src/lib/x402-client.ts` | Create — generic x402 HTTP fetch helper | 4 |
| `src/lib/__tests__/x402-client.test.ts` | Create — unit tests | 4 |
| `src/lib/clusters/types.ts` | Create — shared cluster types | 4 |
| `src/lib/clusters/cluster-a-defi.ts` | Create — DeFi safety tool | 4 |
| `src/lib/clusters/cluster-b-whale.ts` | Create — whale intelligence tool | 4 |
| `src/lib/clusters/cluster-d-social.ts` | Create — social intelligence tool | 4 |
| `src/lib/clusters/cluster-f-solana.ts` | Create — Solana staking tool | 4 |
| `src/lib/agents/orchestrator.ts` | Modify — add cluster tools, update instructions | 4 |
| `src/components/wallet-connect.tsx` | Create — wallet connect button | 5 |
| `src/components/ai-elements/credit-display.tsx` | Create — balance + top-up prompt | 5 |
| `src/components/ai-elements/session-receipt.tsx` | Create — itemized cost breakdown | 5 |
| `src/app/page.tsx` | Modify — add wallet connect, credit display | 5 |

---

## Phase 1: Database Foundation

**Goal:** Set up Neon Postgres, define schema, implement typed store classes with integer microdollar precision.

---

### Task 1.1: Install Neon and Add DATABASE_URL

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install @neondatabase/serverless**

Run: `pnpm add @neondatabase/serverless`

- [ ] **Step 2: Read env.ts**

Read `src/lib/env.ts` to understand the current schema.

- [ ] **Step 3: Add DATABASE_URL to env.ts**

Add to the `server` schema object:

```typescript
DATABASE_URL: z.string().url(),
```

Add to `runtimeEnv`:

```typescript
DATABASE_URL: process.env.DATABASE_URL,
```

- [ ] **Step 4: Read .env.example**

Read `.env.example`.

- [ ] **Step 5: Add DATABASE_URL to .env.example**

Add:

```bash
# Neon Postgres (required for credit system)
DATABASE_URL=postgresql://...
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/env.ts .env.example
git commit -m "feat: add @neondatabase/serverless and DATABASE_URL env var"
```

---

### Task 1.2: Create DB Client Singleton

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create the Neon client module**

```typescript
// src/lib/db.ts
import { neon } from "@neondatabase/serverless";
import { env } from "./env";

// Neon's serverless driver returns a SQL tagged template function.
// Each call opens a fresh HTTP connection — no pool to manage.
export const sql = neon(env.DATABASE_URL);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add Neon Postgres client singleton"
```

---

### Task 1.3: Create DB Schema

**Files:**
- Create: `src/lib/db-schema.sql`

- [ ] **Step 1: Write the DDL file**

```sql
-- src/lib/db-schema.sql
-- Run this against your Neon database to create all tables.
-- All monetary values are stored as integer microdollars (1 USDC = 1,000,000).

CREATE TABLE IF NOT EXISTS credit_accounts (
  wallet_address TEXT PRIMARY KEY,           -- checksummed EVM address
  balance_micro_usdc BIGINT NOT NULL DEFAULT 0,
  lifetime_spent_micro_usdc BIGINT NOT NULL DEFAULT 0,
  free_credits_granted BOOLEAN NOT NULL DEFAULT false,
  free_credits_amount_micro_usdc BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  session_id TEXT PRIMARY KEY,
  free_calls_used INTEGER NOT NULL DEFAULT 0, -- max 2
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_created
  ON anonymous_sessions (created_at);

CREATE TABLE IF NOT EXISTS spend_events (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES credit_accounts(wallet_address),
  tool_name TEXT NOT NULL,
  service_cost_micro_usdc BIGINT NOT NULL,    -- what we paid the x402 provider
  charged_amount_micro_usdc BIGINT NOT NULL,  -- what we charged the user
  markup_bps INTEGER NOT NULL,                -- basis points (3000 = 30%)
  tx_hash TEXT,                               -- on-chain settlement tx
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spend_events_wallet
  ON spend_events (wallet_address, created_at DESC);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db-schema.sql
git commit -m "feat: add Neon Postgres schema for credits, sessions, spend events"
```

---

### Task 1.4: Implement CreditStore

**Files:**
- Create: `src/lib/credits/credit-store.ts`
- Create: `src/lib/__tests__/credit-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/credit-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing CreditStore
vi.mock("../db", () => {
  const rows: Record<string, any[]> = {};
  return {
    sql: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");
      // Store mock behavior on the fn itself
      return (rows[query] ?? []) as any[];
    }),
    __setMockRows: (q: string, r: any[]) => { rows[q] = r; },
    __clearMockRows: () => { Object.keys(rows).forEach(k => delete rows[k]); },
  };
});

import { CreditStore, MICRO_USDC } from "../credits/credit-store";
import { sql } from "../db";

describe("CreditStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts USDC to microdollars correctly", () => {
    expect(MICRO_USDC(0.50)).toBe(500_000);
    expect(MICRO_USDC(1.00)).toBe(1_000_000);
    expect(MICRO_USDC(0.001)).toBe(1_000);
  });

  it("creates an account with zero balance", async () => {
    (sql as any).mockResolvedValueOnce([{
      wallet_address: "0xABC",
      balance_micro_usdc: 0,
      free_credits_granted: false,
    }]);
    const account = await CreditStore.getOrCreate("0xABC");
    expect(account.walletAddress).toBe("0xABC");
    expect(account.balanceMicroUsdc).toBe(0);
  });

  it("deducts balance atomically and returns new balance", async () => {
    // Simulate successful atomic deduction
    (sql as any).mockResolvedValueOnce([{ balance_micro_usdc: 474_000 }]);
    const result = await CreditStore.deduct("0xABC", 26_000);
    expect(result.success).toBe(true);
    expect(result.newBalanceMicroUsdc).toBe(474_000);
  });

  it("rejects deduction when balance insufficient", async () => {
    // Simulate 0 rows returned (insufficient balance)
    (sql as any).mockResolvedValueOnce([]);
    const result = await CreditStore.deduct("0xABC", 1_000_000);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/__tests__/credit-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CreditStore**

```typescript
// src/lib/credits/credit-store.ts
import { sql } from "../db";

/** Convert USDC float to integer microdollars. */
export function MICRO_USDC(usdc: number): number {
  return Math.round(usdc * 1_000_000);
}

/** Convert integer microdollars to USDC float for display. */
export function toUsdc(micro: number): number {
  return micro / 1_000_000;
}

export interface CreditAccount {
  walletAddress: string;
  balanceMicroUsdc: number;
  lifetimeSpentMicroUsdc: number;
  freeCreditsGranted: boolean;
  freeCreditsAmountMicroUsdc: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DeductResult {
  success: boolean;
  newBalanceMicroUsdc?: number;
}

export const CreditStore = {
  /** Get or create a credit account for a wallet address. */
  async getOrCreate(walletAddress: string): Promise<CreditAccount> {
    // Uses DO UPDATE (no-op) instead of DO NOTHING so RETURNING * always
    // returns a row — DO NOTHING returns 0 rows on conflict.
    const rows = await sql`
      INSERT INTO credit_accounts (wallet_address)
      VALUES (${walletAddress})
      ON CONFLICT (wallet_address)
        DO UPDATE SET wallet_address = credit_accounts.wallet_address
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  /** Get account by wallet address. Returns null if not found. */
  async get(walletAddress: string): Promise<CreditAccount | null> {
    const rows = await sql`
      SELECT * FROM credit_accounts WHERE wallet_address = ${walletAddress}
    `;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  /**
   * Atomically deduct from balance. Returns failure if insufficient.
   * Note: lifetime_spent_micro_usdc is NOT updated here — SpendEventStore
   * is the authoritative source for spend tracking and analytics.
   */
  async deduct(walletAddress: string, amountMicroUsdc: number): Promise<DeductResult> {
    const rows = await sql`
      UPDATE credit_accounts
      SET balance_micro_usdc = balance_micro_usdc - ${amountMicroUsdc},
          updated_at = now()
      WHERE wallet_address = ${walletAddress}
        AND balance_micro_usdc >= ${amountMicroUsdc}
      RETURNING balance_micro_usdc
    `;
    if (rows.length === 0) {
      return { success: false };
    }
    return { success: true, newBalanceMicroUsdc: Number(rows[0].balance_micro_usdc) };
  },

  /**
   * Reserve funds before calling a variable-cost x402 service.
   * Atomically deducts the reservation amount. If the service costs less,
   * call release() to return the difference.
   */
  async reserve(walletAddress: string, amountMicroUsdc: number): Promise<DeductResult> {
    // Reservation is implemented as a deduction — same atomic guarantee
    return this.deduct(walletAddress, amountMicroUsdc);
  },

  /**
   * Release unused reservation back to the user's balance.
   * Called after x402 settlement when actual cost < reserved amount.
   */
  async release(walletAddress: string, amountMicroUsdc: number): Promise<number> {
    return this.credit(walletAddress, amountMicroUsdc);
  },

  /** Credit balance (for top-ups, free tier grants, and reservation releases). */
  async credit(walletAddress: string, amountMicroUsdc: number): Promise<number> {
    const rows = await sql`
      UPDATE credit_accounts
      SET balance_micro_usdc = balance_micro_usdc + ${amountMicroUsdc},
          updated_at = now()
      WHERE wallet_address = ${walletAddress}
      RETURNING balance_micro_usdc
    `;
    return Number(rows[0].balance_micro_usdc);
  },

  /** Mark free credits as granted. Returns the new balance. */
  async grantFreeCredits(walletAddress: string, amountMicroUsdc: number): Promise<number> {
    const rows = await sql`
      UPDATE credit_accounts
      SET balance_micro_usdc = balance_micro_usdc + ${amountMicroUsdc},
          free_credits_granted = true,
          free_credits_amount_micro_usdc = ${amountMicroUsdc},
          updated_at = now()
      WHERE wallet_address = ${walletAddress}
        AND free_credits_granted = false
      RETURNING balance_micro_usdc
    `;
    return rows.length > 0 ? Number(rows[0].balance_micro_usdc) : 0;
  },
};

function mapRow(row: Record<string, unknown>): CreditAccount {
  return {
    walletAddress: row.wallet_address as string,
    balanceMicroUsdc: Number(row.balance_micro_usdc),
    lifetimeSpentMicroUsdc: Number(row.lifetime_spent_micro_usdc),
    freeCreditsGranted: row.free_credits_granted as boolean,
    freeCreditsAmountMicroUsdc: Number(row.free_credits_amount_micro_usdc),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/lib/__tests__/credit-store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits/credit-store.ts src/lib/__tests__/credit-store.test.ts
git commit -m "feat: add CreditStore with integer microdollar precision"
```

---

### Task 1.5: Implement AnonymousSessionStore

**Files:**
- Create: `src/lib/credits/session-store.ts`
- Create: `src/lib/__tests__/session-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/session-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  sql: vi.fn(),
}));

import { SessionStore } from "../credits/session-store";
import { sql } from "../db";

describe("SessionStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a session with 0 calls used", async () => {
    (sql as any).mockResolvedValueOnce([{ session_id: "abc", free_calls_used: 0 }]);
    const session = await SessionStore.getOrCreate("abc");
    expect(session.freeCallsUsed).toBe(0);
  });

  it("increments call count", async () => {
    (sql as any).mockResolvedValueOnce([{ free_calls_used: 1 }]);
    const count = await SessionStore.incrementCallCount("abc");
    expect(count).toBe(1);
  });

  it("checks if free calls exhausted", () => {
    expect(SessionStore.isFreeCallsExhausted(2)).toBe(true);
    expect(SessionStore.isFreeCallsExhausted(1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/__tests__/session-store.test.ts`

- [ ] **Step 3: Implement SessionStore**

```typescript
// src/lib/credits/session-store.ts
import { sql } from "../db";

const MAX_FREE_CALLS = 2;

export interface AnonymousSession {
  sessionId: string;
  freeCallsUsed: number;
  createdAt: Date;
}

export const SessionStore = {
  async getOrCreate(sessionId: string): Promise<AnonymousSession> {
    // Uses DO UPDATE (no-op touch) instead of DO NOTHING so that
    // RETURNING * always yields a row. DO NOTHING returns 0 rows on
    // conflict, which would crash mapRow(rows[0]).
    const rows = await sql`
      INSERT INTO anonymous_sessions (session_id)
      VALUES (${sessionId})
      ON CONFLICT (session_id)
        DO UPDATE SET session_id = anonymous_sessions.session_id
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  async incrementCallCount(sessionId: string): Promise<number> {
    const rows = await sql`
      UPDATE anonymous_sessions
      SET free_calls_used = free_calls_used + 1
      WHERE session_id = ${sessionId}
      RETURNING free_calls_used
    `;
    return Number(rows[0].free_calls_used);
  },

  isFreeCallsExhausted(callCount: number): boolean {
    return callCount >= MAX_FREE_CALLS;
  },

  MAX_FREE_CALLS,
};

function mapRow(row: Record<string, unknown>): AnonymousSession {
  return {
    sessionId: row.session_id as string,
    freeCallsUsed: Number(row.free_calls_used),
    createdAt: new Date(row.created_at as string),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/lib/__tests__/session-store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits/session-store.ts src/lib/__tests__/session-store.test.ts
git commit -m "feat: add AnonymousSessionStore backed by Neon Postgres"
```

---

### Task 1.6: Implement SpendEventStore

**Files:**
- Create: `src/lib/credits/spend-store.ts`
- Create: `src/lib/__tests__/spend-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/spend-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  sql: vi.fn(),
}));

import { SpendEventStore } from "../credits/spend-store";
import { sql } from "../db";

describe("SpendEventStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a spend event with correct parameters", async () => {
    (sql as any).mockResolvedValueOnce([]);
    await SpendEventStore.record({
      walletAddress: "0xABC",
      toolName: "rug_munch_scan",
      serviceCostMicroUsdc: 20_000,
      chargedAmountMicroUsdc: 26_000,
      markupBps: 3000,
      txHash: "0xdef",
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("returns mapped spend events from getRecent", async () => {
    (sql as any).mockResolvedValueOnce([{
      id: 1,
      wallet_address: "0xABC",
      tool_name: "rug_munch_scan",
      service_cost_micro_usdc: 20_000,
      charged_amount_micro_usdc: 26_000,
      markup_bps: 3000,
      tx_hash: "0xdef",
      created_at: "2026-03-20T00:00:00Z",
    }]);
    const events = await SpendEventStore.getRecent("0xABC");
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe("rug_munch_scan");
    expect(events[0].chargedAmountMicroUsdc).toBe(26_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/__tests__/spend-store.test.ts`

- [ ] **Step 3: Implement SpendEventStore**

```typescript
// src/lib/credits/spend-store.ts
import { sql } from "../db";

export interface SpendEvent {
  id: number;
  walletAddress: string;
  toolName: string;
  serviceCostMicroUsdc: number;
  chargedAmountMicroUsdc: number;
  markupBps: number;
  txHash: string | null;
  createdAt: Date;
}

export const SpendEventStore = {
  async record(event: {
    walletAddress: string;
    toolName: string;
    serviceCostMicroUsdc: number;
    chargedAmountMicroUsdc: number;
    markupBps: number;
    txHash?: string;
  }): Promise<void> {
    await sql`
      INSERT INTO spend_events (
        wallet_address, tool_name,
        service_cost_micro_usdc, charged_amount_micro_usdc,
        markup_bps, tx_hash
      ) VALUES (
        ${event.walletAddress}, ${event.toolName},
        ${event.serviceCostMicroUsdc}, ${event.chargedAmountMicroUsdc},
        ${event.markupBps}, ${event.txHash ?? null}
      )
    `;
  },

  /** Check if a tx_hash has already been processed (idempotency for webhooks). */
  async existsByTxHash(txHash: string): Promise<boolean> {
    const rows = await sql`
      SELECT 1 FROM spend_events WHERE tx_hash = ${txHash} LIMIT 1
    `;
    return rows.length > 0;
  },

  /** Get recent spend events for session receipt display. */
  async getRecent(walletAddress: string, limit = 20): Promise<SpendEvent[]> {
    const rows = await sql`
      SELECT * FROM spend_events
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(mapRow);
  },
};

function mapRow(row: Record<string, unknown>): SpendEvent {
  return {
    id: Number(row.id),
    walletAddress: row.wallet_address as string,
    toolName: row.tool_name as string,
    serviceCostMicroUsdc: Number(row.service_cost_micro_usdc),
    chargedAmountMicroUsdc: Number(row.charged_amount_micro_usdc),
    markupBps: Number(row.markup_bps),
    txHash: row.tx_hash as string | null,
    createdAt: new Date(row.created_at as string),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/__tests__/spend-store.test.ts`
Expected: All PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/lib/credits/spend-store.ts src/lib/__tests__/spend-store.test.ts
git commit -m "feat: add SpendEventStore for payment audit trail"
```

---

## Phase 2: Session & Credit Integration

**Goal:** Replace the in-memory `sessionStore` Map with DB-backed sessions. Wire credit balance into the chat route so wallet users pay from credits.

---

### Task 2.1: Evolve BudgetController for Credit Mode

The existing `BudgetController` is session-scoped and in-memory. It needs a new mode: credit-based, where `canSpend` checks the DB balance and `recordSpend` deducts atomically.

**Files:**
- Modify: `src/lib/budget-controller.ts`
- Modify: `src/lib/__tests__/budget-controller.test.ts`

- [ ] **Step 1: Read the existing BudgetController and its tests**

Read `src/lib/budget-controller.ts` and `src/lib/__tests__/budget-controller.test.ts`.

- [ ] **Step 2: Add credit-mode constructor option**

Add a new constructor shape that accepts a wallet address and starting balance from the DB. The existing session-based mode stays for anonymous users.

```typescript
interface CreditModeOptions {
  mode: "credit";
  walletAddress: string;
  balanceMicroUsdc: number;
}

interface SessionModeOptions {
  mode?: "session"; // default, backward compat
  sessionLimitUsdc: number;
  maxCalls?: number;
  initialCallCount?: number;
  initialSpent?: number;
}

type BudgetControllerOptions = CreditModeOptions | SessionModeOptions;
```

The class body branches on mode. Credit mode uses micro-USDC internally; all `recordSpend` calls pass micro-USDC in credit mode:

```typescript
export class BudgetController {
  private mode: "session" | "credit";
  // Session mode fields
  private sessionLimitUsdc: number;
  private maxCalls: number;
  private callCount: number;
  private spentUsdc: number;
  // Credit mode fields
  private walletAddress: string | null;
  private balanceMicroUsdc: number;
  // Shared
  private history: Array<{ tool: string; amountMicroUsdc: number; txHash?: string }> = [];

  constructor(options: BudgetControllerOptions) {
    if ("mode" in options && options.mode === "credit") {
      this.mode = "credit";
      this.walletAddress = options.walletAddress;
      this.balanceMicroUsdc = options.balanceMicroUsdc;
      this.sessionLimitUsdc = 0;
      this.maxCalls = Infinity;
      this.callCount = 0;
      this.spentUsdc = 0;
    } else {
      this.mode = "session";
      const opts = options as SessionModeOptions;
      this.sessionLimitUsdc = opts.sessionLimitUsdc;
      this.maxCalls = opts.maxCalls ?? Infinity;
      this.callCount = opts.initialCallCount ?? 0;
      this.spentUsdc = opts.initialSpent ?? 0;
      this.walletAddress = null;
      this.balanceMicroUsdc = 0;
    }
  }

  /** Check if a spend of `amountMicroUsdc` is allowed. */
  canSpend(amountMicroUsdc: number): { allowed: boolean; reason?: string } {
    if (this.mode === "credit") {
      if (amountMicroUsdc > this.balanceMicroUsdc) {
        return { allowed: false, reason: "Insufficient credit balance" };
      }
      return { allowed: true };
    }
    // Session mode — check against USD limit
    const amountUsdc = amountMicroUsdc / 1_000_000;
    if (this.spentUsdc + amountUsdc > this.sessionLimitUsdc) {
      return { allowed: false, reason: "Session budget exceeded" };
    }
    return { allowed: true };
  }

  /** Record a spend. In credit mode, amount is micro-USDC. In session mode, amount is micro-USDC (converted internally). */
  recordSpend(amountMicroUsdc: number, toolName: string, txHash?: string): void {
    if (this.mode === "credit") {
      this.balanceMicroUsdc -= amountMicroUsdc;
    } else {
      this.spentUsdc += amountMicroUsdc / 1_000_000;
    }
    this.history.push({ tool: toolName, amountMicroUsdc, txHash });
  }

  canMakeCall(): { allowed: boolean; reason?: string } {
    if (this.mode === "credit") return { allowed: true };
    if (this.callCount >= this.maxCalls) {
      return { allowed: false, reason: "Call limit reached" };
    }
    return { allowed: true };
  }

  recordCall(): void { this.callCount++; }
  getCallCount(): number { return this.callCount; }

  remainingUsdc(): number {
    if (this.mode === "credit") return this.balanceMicroUsdc / 1_000_000;
    return Math.max(0, this.sessionLimitUsdc - this.spentUsdc);
  }
}
```

- [ ] **Step 3: Update existing tests and add credit mode tests**

Add these tests to `src/lib/__tests__/budget-controller.test.ts`:

```typescript
describe("BudgetController — credit mode", () => {
  it("allows spend within balance", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 500_000, // $0.50
    });
    const check = bc.canSpend(100_000); // $0.10
    expect(check.allowed).toBe(true);
    expect(bc.remainingUsdc()).toBeCloseTo(0.5);
  });

  it("rejects spend exceeding balance", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 50_000, // $0.05
    });
    const check = bc.canSpend(100_000); // $0.10
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Insufficient");
  });

  it("tracks remaining balance after recordSpend", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 500_000,
    });
    bc.recordSpend(100_000, "test_tool", "0xtx1");
    expect(bc.remainingUsdc()).toBeCloseTo(0.4);
    // Second spend
    bc.recordSpend(200_000, "test_tool_2", "0xtx2");
    expect(bc.remainingUsdc()).toBeCloseTo(0.2);
  });

  it("has no call limit in credit mode", () => {
    const bc = new BudgetController({
      mode: "credit",
      walletAddress: "0xabc",
      balanceMicroUsdc: 1_000_000,
    });
    // Should always allow calls (no maxCalls in credit mode)
    for (let i = 0; i < 10; i++) {
      expect(bc.canMakeCall().allowed).toBe(true);
      bc.recordCall();
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/lib/__tests__/budget-controller.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget-controller.ts src/lib/__tests__/budget-controller.test.ts
git commit -m "feat: add credit mode to BudgetController for wallet-based users"
```

---

### Task 2.2: Replace In-Memory Sessions in Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Read the current chat route**

Read `src/app/api/chat/route.ts` in full.

- [ ] **Step 2: Replace the in-memory sessionStore with DB-backed SessionStore**

Remove the `sessionStore` Map, `SESSION_TIMEOUT_MS`, and `getOrCreateSession()` function (lines 13-41).

Replace with:

```typescript
import { SessionStore } from "@/lib/credits/session-store";
import { CreditStore, toUsdc } from "@/lib/credits/credit-store";
```

- [ ] **Step 3: Update the POST handler for dual-mode auth**

The handler now has two flows:
1. **Anonymous (no wallet):** Uses `SessionStore` from DB. 2 free calls.
2. **Wallet user (has `x-wallet-address` header):** Uses `CreditStore` from DB.

```typescript
export const POST = async (request: Request) => {
  const cookieHeader = request.headers.get("cookie") || "";
  const existingSessionId = cookieHeader.match(/session_id=([^;]+)/)?.[1];
  const sessionId = existingSessionId || crypto.randomUUID();
  const walletAddress = request.headers.get("x-wallet-address");

  let budget: BudgetController;

  if (walletAddress) {
    // Wallet user — credit-based
    const account = await CreditStore.getOrCreate(walletAddress);
    budget = new BudgetController({
      mode: "credit",
      walletAddress,
      balanceMicroUsdc: account.balanceMicroUsdc,
    });
  } else {
    // Anonymous — session-based, 2 free calls
    const session = await SessionStore.getOrCreate(sessionId);
    if (SessionStore.isFreeCallsExhausted(session.freeCallsUsed)) {
      return new Response(
        JSON.stringify({
          error: "Free calls exhausted. Connect a wallet to continue.",
          code: "FREE_CALLS_EXHAUSTED",
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }
    // Increment in DB AFTER the exhaustion check, BEFORE constructing BudgetController.
    // The BudgetController is constructed with the post-increment count so its internal
    // tracking matches the DB. Do NOT call budget.recordCall() later — the DB is the
    // source of truth for anonymous call counts.
    await SessionStore.incrementCallCount(sessionId);
    budget = new BudgetController({
      mode: "session",
      sessionLimitUsdc: 0.50,
      maxCalls: 2,
      initialCallCount: session.freeCallsUsed + 1, // post-increment
    });
  }

  // IMPORTANT: Remove the existing `budget.recordCall()` line (line 83 of the old route).
  // For anonymous users, the DB increment above is the source of truth.
  // For wallet users, there is no call limit in credit mode.
  //
  // ... rest of handler (MCP client, orchestrator, streaming) stays the same
```

- [ ] **Step 4: Update onStepFinish to record SpendEvents for wallet users**

After existing payment tracking logic, add:

```typescript
import { SpendEventStore } from "@/lib/credits/spend-store";
import { MICRO_USDC } from "@/lib/credits/credit-store";

// Inside onStepFinish, replace the existing budget.recordSpend() call:
if (paymentResponse?.transaction) {
  // All amounts in micro-USDC for consistency
  const serviceCostMicro = TOOL_PRICES[toolResult.toolName]
    ? Math.round(TOOL_PRICES[toolResult.toolName] * 1_000_000)
    : 0;
  const markupBps = 3000; // 30%
  const chargedMicro = Math.round(serviceCostMicro * 1.30);

  // Track in BudgetController (micro-USDC in both modes)
  budget.recordSpend(chargedMicro, toolResult.toolName, paymentResponse.transaction);

  if (walletAddress) {
    // Atomic DB deduction for wallet users
    const result = await CreditStore.deduct(walletAddress, chargedMicro);
    if (!result.success) {
      console.error("Credit deduction failed — balance may have gone negative");
    }

    await SpendEventStore.record({
      walletAddress,
      toolName: toolResult.toolName,
      serviceCostMicroUsdc: serviceCostMicro,
      chargedAmountMicroUsdc: chargedMicro,
      markupBps,
      txHash: paymentResponse.transaction,
    });
  }
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 6: Test manually — anonymous flow still works with 2 free calls**

Start dev server, send 2 messages. Third message should return 402 with "Free calls exhausted."

- [ ] **Step 7: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: replace in-memory sessions with DB-backed credit/session stores"
```

---

## Phase 3: Credit APIs

**Goal:** API endpoints for claiming free credits, initiating top-ups, and detecting on-chain deposits.

---

### Task 3.1: Create Claim Endpoint

Users connect their wallet and receive free credits based on wallet age (via existing `get_wallet_profile` tool data or a direct RPC call).

**Files:**
- Create: `src/app/api/credits/claim/route.ts`

- [ ] **Step 1: Create the claim API route**

```typescript
// src/app/api/credits/claim/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { createPublicClient, http } from "viem";
import { getChain } from "@/lib/accounts";

const ClaimSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const { walletAddress } = parsed.data;
  const account = await CreditStore.getOrCreate(walletAddress);

  if (account.freeCreditsGranted) {
    return NextResponse.json({
      error: "Free credits already claimed for this wallet",
      balance: account.balanceMicroUsdc,
    }, { status: 409 });
  }

  // Sybil guard: use transaction count as a proxy for wallet age/activity.
  // Spec calls for wallet age in days, but fetching the first tx timestamp
  // requires scanning block history which is slow and unreliable without an
  // indexer. Tx count is a reasonable proxy for Phase 1. A wallet with 50+
  // txs is very likely >30 days old. This diverges from the spec's exact
  // thresholds — revisit if Sybil abuse is observed.
  const client = createPublicClient({ chain: getChain(), transport: http() });
  const txCount = await client.getTransactionCount({
    address: walletAddress as `0x${string}`,
  });

  let grantMicroUsdc: number;
  if (txCount < 5) {
    grantMicroUsdc = MICRO_USDC(0.10); // Likely new wallet (<7 days)
  } else if (txCount < 50) {
    grantMicroUsdc = MICRO_USDC(0.25); // Some activity (7-30 days)
  } else {
    grantMicroUsdc = MICRO_USDC(0.50); // Established wallet (>30 days)
  }

  const newBalance = await CreditStore.grantFreeCredits(walletAddress, grantMicroUsdc);

  return NextResponse.json({
    granted: grantMicroUsdc,
    balance: newBalance,
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/credits/claim/route.ts
git commit -m "feat: add /api/credits/claim endpoint for wallet-gated free credits"
```

---

### Task 3.2: Create Top-Up Endpoint

Returns the house wallet address so the user can send USDC directly.

**Files:**
- Create: `src/app/api/credits/topup/route.ts`

- [ ] **Step 1: Create the top-up API route**

```typescript
// src/app/api/credits/topup/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSellerAccount } from "@/lib/accounts";
import { CreditStore } from "@/lib/credits/credit-store";
import { env } from "@/lib/env";

const TopUpSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = TopUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  // Ensure the wallet has a credit account
  await CreditStore.getOrCreate(parsed.data.walletAddress);

  // Return the SELLER (treasury) wallet address for USDC deposits.
  // This is separate from the purchaser wallet that pays x402 services,
  // keeping deposit accounting cleanly separated from spending.
  const treasuryAccount = await getOrCreateSellerAccount();
  return NextResponse.json({
    depositAddress: treasuryAccount.address,
    network: env.NETWORK,
    asset: "USDC",
    minimumUsdc: 1.00,
    instructions: "Send USDC to this address on Base. Your balance will update automatically.",
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/credits/topup/route.ts
git commit -m "feat: add /api/credits/topup endpoint returning house wallet address"
```

---

### Task 3.3: Create Webhook Endpoint for USDC Deposits

Alchemy sends a webhook when USDC is transferred to the house wallet. This endpoint credits the sender's balance.

**Files:**
- Create: `src/app/api/credits/webhook/route.ts`

- [ ] **Step 1: Create the webhook route**

```typescript
// src/app/api/credits/webhook/route.ts
import { NextResponse } from "next/server";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";

// Alchemy webhook payload shape for address activity
interface AlchemyWebhookPayload {
  webhookId: string;
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      value: number;
      asset: string;
      hash: string;
    }>;
  };
}

export async function POST(req: Request) {
  // TODO: Verify Alchemy webhook signature in production
  const payload = (await req.json()) as AlchemyWebhookPayload;

  for (const activity of payload.event.activity) {
    if (activity.asset !== "USDC") continue;

    const senderAddress = activity.fromAddress;
    const amountUsdc = activity.value;
    const amountMicro = MICRO_USDC(amountUsdc);

    // Idempotency: check if this tx was already processed.
    // Uses spend_events table with a unique tx_hash lookup.
    // For top-ups, we record a special "topup" spend event with negative charged amount.
    const alreadyProcessed = await SpendEventStore.existsByTxHash(activity.hash);
    if (alreadyProcessed) {
      console.log(`Skipping already-processed tx ${activity.hash}`);
      continue;
    }

    // Credit the sender's account
    const account = await CreditStore.get(senderAddress);
    if (account) {
      await CreditStore.credit(senderAddress, amountMicro);
      // Record the top-up event for idempotency and audit trail
      await SpendEventStore.record({
        walletAddress: senderAddress,
        toolName: "topup",
        serviceCostMicroUsdc: 0,
        chargedAmountMicroUsdc: -amountMicro, // negative = credit
        markupBps: 0,
        txHash: activity.hash,
      });
      console.log(`Credited ${amountUsdc} USDC to ${senderAddress} (tx: ${activity.hash})`);
    } else {
      console.warn(`USDC deposit from unknown wallet ${senderAddress} — no credit account found`);
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/credits/webhook/route.ts
git commit -m "feat: add /api/credits/webhook for Alchemy USDC deposit detection"
```

---

### Task 3.4: Create Cron Fallback for Missed Webhooks

**Files:**
- Create: `src/app/api/credits/check-topups/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the cron route**

```typescript
// src/app/api/credits/check-topups/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DELIBERATE STUB — RPC polling is a follow-up task.
  // This cron endpoint exists so the vercel.json config is wired and tested.
  // Implementation (follow-up task, not in this plan):
  // 1. Query Base RPC for USDC Transfer events to house wallet in last 120s
  // 2. For each transfer, check if it was already credited (idempotency via tx_hash in spend_events)
  // 3. Credit any missed deposits via CreditStore.credit()

  console.log("Cron: check-topups ran (RPC polling not yet implemented — follow-up task)");
  return NextResponse.json({ ok: true, stub: true });
}
```

- [ ] **Step 2: Create vercel.json with cron config**

```json
{
  "crons": [
    {
      "path": "/api/credits/check-topups",
      "schedule": "* * * * *"
    }
  ]
}
```

- [ ] **Step 3: Add CRON_SECRET to env.ts**

Add to the `server` schema in `src/lib/env.ts`:

```typescript
CRON_SECRET: z.string().optional(),
```

And to `runtimeEnv`:

```typescript
CRON_SECRET: process.env.CRON_SECRET,
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/credits/check-topups/route.ts vercel.json src/lib/env.ts
git commit -m "feat: add cron fallback for missed USDC deposit webhooks"
```

---

## Phase 4: x402 Client & Cluster Modules

**Goal:** Build a generic x402 HTTP client for calling external services, then implement cluster tools that the orchestrator's ToolLoopAgent can invoke.

---

### Task 4.1: Create Generic x402 HTTP Client

**Files:**
- Create: `src/lib/x402-client.ts`
- Create: `src/lib/__tests__/x402-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/x402-client.test.ts
import { describe, it, expect, vi } from "vitest";
import { parse402Response } from "../x402-client";

describe("x402-client", () => {
  it("parses 402 response with payment requirements", () => {
    const body = {
      x402Version: 1,
      error: "Payment Required",
      accepts: [{
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "10000",
        resource: "/api/scan",
        payTo: "0xABC",
        maxTimeoutSeconds: 60,
        asset: "USDC",
        description: "Rug scan",
        mimeType: "application/json",
      }],
    };
    const result = parse402Response(body);
    expect(result).not.toBeNull();
    expect(result!.maxAmountRequired).toBe("10000");
  });

  it("returns null for non-402 body", () => {
    const result = parse402Response({ data: "ok" });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/__tests__/x402-client.test.ts`

- [ ] **Step 3: Implement x402-client**

```typescript
// src/lib/x402-client.ts
import { createPaymentHeader } from "x402/client";
import type { WalletClient } from "viem";

const X402_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 8000;

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

interface X402FetchOptions {
  walletClient: WalletClient;
  /** Max amount willing to pay in micro-USDC. Rejects if service asks for more. */
  maxPaymentMicroUsdc?: number;
  timeoutMs?: number;
}

interface X402Result {
  data: unknown;
  paid: boolean;
  amountMicroUsdc: number;
  txHash?: string;
  paymentRequirements?: PaymentRequirements;
}

/**
 * Parse a response body to extract x402 payment requirements.
 * Returns null if the body is not a valid 402 response.
 */
export function parse402Response(body: unknown): PaymentRequirements | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.x402Version !== "number") return null;
  if (!Array.isArray(obj.accepts) || obj.accepts.length === 0) return null;
  return obj.accepts[0] as PaymentRequirements;
}

/**
 * Fetch an x402-protected endpoint. Handles the 402 → sign → retry flow.
 *
 * 1. Makes initial request
 * 2. If 402, reads payment requirements
 * 3. Signs EIP-3009 authorization with the provided wallet
 * 4. Retries with X-PAYMENT header
 * 5. Returns the final response data + payment metadata
 */
export async function x402Fetch(
  url: string,
  init: RequestInit | undefined,
  options: X402FetchOptions,
): Promise<X402Result> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // First call — no payment
  const res1 = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeout),
  });

  // Not a 402 — return response directly
  if (res1.status !== 402) {
    const data = await res1.json();
    return { data, paid: false, amountMicroUsdc: 0 };
  }

  // Parse 402 response
  const body402 = await res1.json();
  const requirements = parse402Response(body402);
  if (!requirements) {
    throw new Error(`x402: 402 response missing valid payment requirements from ${url}`);
  }

  // Check amount against max
  const amountMicro = Number(requirements.maxAmountRequired);
  if (options.maxPaymentMicroUsdc && amountMicro > options.maxPaymentMicroUsdc) {
    throw new Error(
      `x402: service ${url} asks for ${amountMicro} micro-USDC, exceeds max ${options.maxPaymentMicroUsdc}`
    );
  }

  // Sign payment header
  const paymentHeader = await createPaymentHeader(
    options.walletClient as any,
    X402_VERSION,
    requirements,
  );

  // Retry with payment
  const res2 = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "X-PAYMENT": paymentHeader,
    },
    signal: AbortSignal.timeout(timeout),
  });

  // Check for service errors after payment (e.g., 4xx/5xx despite payment)
  if (!res2.ok) {
    const errorBody = await res2.text();
    throw new Error(
      `x402: service ${url} returned ${res2.status} after payment (${amountMicro} micro-USDC charged). Body: ${errorBody.slice(0, 200)}`
    );
  }

  const data = await res2.json();

  // Extract txHash from x402 facilitator response headers or body
  const txHash = res2.headers.get("x-payment-tx")
    ?? (typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).txHash as string | undefined
      : undefined);

  return {
    data,
    paid: true,
    amountMicroUsdc: amountMicro,
    txHash,
    paymentRequirements: requirements,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/lib/__tests__/x402-client.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/x402-client.ts src/lib/__tests__/x402-client.test.ts
git commit -m "feat: add generic x402 HTTP client for calling external services"
```

---

### Task 4.2: Create Cluster Types and Config

**Files:**
- Create: `src/lib/clusters/types.ts`

- [ ] **Step 1: Define shared types and service config**

```typescript
// src/lib/clusters/types.ts

/** Result from a single x402 service call within a cluster. */
export interface ServiceCallResult {
  serviceName: string;
  data: unknown;
  costMicroUsdc: number;
  paid: boolean;
  error?: string;
}

/** Result from a cluster tool execution. */
export interface ClusterResult {
  summary: string;
  serviceCalls: ServiceCallResult[];
  totalCostMicroUsdc: number;
}

/** Markup rates in basis points. */
export const MARKUP_BPS: Record<string, number> = {
  default: 3000,     // 30%
  stakevia: 2500,    // 25%
  blockrun: 1000,    // 10% net (they charge cost+5%, we charge cost+15%)
};

/** Apply markup to a micro-USDC amount. */
export function applyMarkup(costMicroUsdc: number, markupBps = 3000): number {
  return Math.round(costMicroUsdc * (1 + markupBps / 10_000));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/clusters/types.ts
git commit -m "feat: add shared cluster types, markup logic"
```

---

### Task 4.3: Implement Cluster A — DeFi Safety

This is the first cluster. It serves as the pattern for B, D, and F.

**Files:**
- Create: `src/lib/clusters/cluster-a-defi.ts`
- Modify: `src/lib/env.ts` — add service URL env vars

- [ ] **Step 1: Add service URL env vars**

Add to `src/lib/env.ts` server schema:

```typescript
// x402 service URLs (optional — cluster tools gracefully degrade when unavailable)
RUGMUNCH_URL: z.string().url().optional(),
AUGUR_URL: z.string().url().optional(),
DIAMONDCLAWS_URL: z.string().url().optional(),
WALLETIQ_URL: z.string().url().optional(),
```

Add matching `runtimeEnv` entries.

- [ ] **Step 2: Implement the Cluster A tool**

```typescript
// src/lib/clusters/cluster-a-defi.ts
import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterADeps {
  walletClient: WalletClient;
  /** Wallet address of the user (for credit reservation). Null for anonymous. */
  userWallet: string | null;
}

export function createClusterATools(deps: ClusterADeps) {
  return {
    analyze_defi_safety: tool({
      description:
        "Analyze a token or contract for rug pull risks, honeypot detection, and smart contract vulnerabilities. " +
        "Calls external x402 DeFi safety services (RugMunch, Augur, DiamondClaws). " +
        "Costs $0.12-$0.50 depending on depth.",
      inputSchema: z.object({
        target: z.string().describe("Token address, contract address, or token name to analyze"),
        depth: z.enum(["quick", "full"]).default("quick")
          .describe("'quick' = core scan only (~$0.12), 'full' = all services (~$0.50)"),
      }),
      execute: async ({ target, depth }): Promise<ClusterResult> => {
        // Reserve max RAW service cost upfront (spec section 5).
        // Markup is applied later in the chat route's onStepFinish when recording the SpendEvent.
        // Reserve/release math must use the same unit (raw service cost) for consistency.
        const maxReservationMicro = depth === "full" ? 2_200_000 : 200_000; // $2.20 or $0.20 raw service cost max
        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return {
              summary: "Insufficient credit balance for this analysis. Please top up.",
              serviceCalls: [],
              totalCostMicroUsdc: 0,
            };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        // Always call RugMunch (core detection)
        if (env.RUGMUNCH_URL) {
          try {
            const result = await x402Fetch(
              `${env.RUGMUNCH_URL}/scan?target=${encodeURIComponent(target)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 2_000_000 },
            );
            calls.push({
              serviceName: "RugMunch",
              data: result.data,
              costMicroUsdc: result.amountMicroUsdc,
              paid: result.paid,
            });
          } catch (err) {
            errors.push(`RugMunch: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("RugMunch: not configured");
        }

        // Always call Augur (contract risk score)
        if (env.AUGUR_URL) {
          try {
            const result = await x402Fetch(
              `${env.AUGUR_URL}/analyze?address=${encodeURIComponent(target)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 200_000 },
            );
            calls.push({
              serviceName: "Augur",
              data: result.data,
              costMicroUsdc: result.amountMicroUsdc,
              paid: result.paid,
            });
          } catch (err) {
            errors.push(`Augur: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("Augur: not configured");
        }

        // Full depth: add DiamondClaws
        if (depth === "full" && env.DIAMONDCLAWS_URL) {
          try {
            const result = await x402Fetch(
              `${env.DIAMONDCLAWS_URL}/score?target=${encodeURIComponent(target)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 10_000 },
            );
            calls.push({
              serviceName: "DiamondClaws",
              data: result.data,
              costMicroUsdc: result.amountMicroUsdc,
              paid: result.paid,
            });
          } catch (err) {
            errors.push(`DiamondClaws: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        // totalCost is raw service cost in micro-USDC (same unit as reservation)
        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        // Release unused reservation back to user's balance (both in raw micro-USDC)
        if (deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) {
            await CreditStore.release(deps.userWallet, unusedMicro);
          }
        }

        const summary = calls.length > 0
          ? `Analyzed ${target} using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (errors.length > 0 ? `Unavailable: ${errors.join("; ")}` : "")
          : `No DeFi safety services available. ${errors.join("; ")}`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
      },
    }),
  };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/lib/clusters/cluster-a-defi.ts src/lib/env.ts
git commit -m "feat: add Cluster A (DeFi safety) tool with RugMunch + Augur + DiamondClaws"
```

---

### Task 4.4: Implement Clusters B, D, F

Follow the same pattern as Cluster A. Each cluster is a local AI SDK tool with reservation/release.

**Files:**
- Create: `src/lib/clusters/cluster-b-whale.ts`
- Create: `src/lib/clusters/cluster-d-social.ts`
- Create: `src/lib/clusters/cluster-f-solana.ts`
- Modify: `src/lib/env.ts` — add remaining service URL env vars

- [ ] **Step 1: Add remaining service URL env vars to env.ts**

```typescript
// Cluster B
EINSTEIN_AI_URL: z.string().url().optional(),
SLAMAI_URL: z.string().url().optional(),
MYCELIA_URL: z.string().url().optional(),
// Cluster D
TWITSH_URL: z.string().url().optional(),
NEYNAR_URL: z.string().url().optional(),
FIRECRAWL_URL: z.string().url().optional(),
// Cluster F
STAKEVIA_URL: z.string().url().optional(),
```

Add matching `runtimeEnv` entries for each.

- [ ] **Step 2: Implement Cluster B (Whale Intelligence)**

```typescript
// src/lib/clusters/cluster-b-whale.ts
import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterBDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterBTools(deps: ClusterBDeps) {
  return {
    track_whale_activity: tool({
      description:
        "Track whale and smart money activity — what large wallets are buying/selling. " +
        "Calls Einstein AI, SLAMai, and Mycelia Signal x402 services. " +
        "Costs ~$0.05-$0.15 depending on available services.",
      inputSchema: z.object({
        query: z.string().describe("What to track, e.g. 'what are whales buying', 'smart money flows ETH'"),
      }),
      execute: async ({ query }): Promise<ClusterResult> => {
        const maxReservationMicro = 200_000; // $0.20 with markup
        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        // Einstein AI — whale tracking
        if (env.EINSTEIN_AI_URL) {
          try {
            const result = await x402Fetch(
              `${env.EINSTEIN_AI_URL}/whales?q=${encodeURIComponent(query)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 100_000 },
            );
            calls.push({ serviceName: "Einstein AI", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Einstein AI: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("Einstein AI: not configured");
        }

        // SLAMai — smart money intelligence
        if (env.SLAMAI_URL) {
          try {
            const result = await x402Fetch(
              `${env.SLAMAI_URL}/smart-money?q=${encodeURIComponent(query)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 100_000 },
            );
            calls.push({ serviceName: "SLAMai", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`SLAMai: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("SLAMai: not configured");
        }

        // Mycelia Signal — price feeds for context
        if (env.MYCELIA_URL) {
          try {
            const result = await x402Fetch(
              `${env.MYCELIA_URL}/prices?symbols=BTC,ETH,SOL`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 10_000 },
            );
            calls.push({ serviceName: "Mycelia Signal", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Mycelia Signal: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) await CreditStore.release(deps.userWallet, unusedMicro);
        }

        const summary = calls.length > 0
          ? `Tracked whale activity using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (errors.length > 0 ? `Unavailable: ${errors.join("; ")}` : "")
          : `No whale intelligence services available. ${errors.join("; ")}`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
      },
    }),
  };
}
```

- [ ] **Step 3: Implement Cluster D (Social Intelligence)**

```typescript
// src/lib/clusters/cluster-d-social.ts
import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterDDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterDTools(deps: ClusterDDeps) {
  return {
    analyze_social_narrative: tool({
      description:
        "Analyze social media narrative and sentiment around a crypto topic. " +
        "Calls twit.sh (Twitter/X), Neynar (Farcaster), and Firecrawl (web scraping) x402 services. " +
        "Costs ~$0.03-$0.10.",
      inputSchema: z.object({
        topic: z.string().describe("Topic to analyze, e.g. 'Solana sentiment', 'ETH merge narrative'"),
      }),
      execute: async ({ topic }): Promise<ClusterResult> => {
        const maxReservationMicro = 130_000; // $0.13 with markup
        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance. Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        // twit.sh — Twitter/X data
        if (env.TWITSH_URL) {
          try {
            const result = await x402Fetch(
              `${env.TWITSH_URL}/search?q=${encodeURIComponent(topic)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 50_000 },
            );
            calls.push({ serviceName: "twit.sh", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`twit.sh: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("twit.sh: not configured");
        }

        // Neynar — Farcaster social graph
        if (env.NEYNAR_URL) {
          try {
            const result = await x402Fetch(
              `${env.NEYNAR_URL}/search?q=${encodeURIComponent(topic)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 50_000 },
            );
            calls.push({ serviceName: "Neynar", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Neynar: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("Neynar: not configured");
        }

        // Firecrawl — web scraping for broader context
        if (env.FIRECRAWL_URL) {
          try {
            const result = await x402Fetch(
              `${env.FIRECRAWL_URL}/scrape?q=${encodeURIComponent(topic)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 50_000 },
            );
            calls.push({ serviceName: "Firecrawl", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Firecrawl: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) await CreditStore.release(deps.userWallet, unusedMicro);
        }

        const summary = calls.length > 0
          ? `Analyzed social narrative for "${topic}" using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (errors.length > 0 ? `Unavailable: ${errors.join("; ")}` : "")
          : `No social intelligence services available. ${errors.join("; ")}`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
      },
    }),
  };
}
```

- [ ] **Step 4: Implement Cluster F (Solana Staking)**

```typescript
// src/lib/clusters/cluster-f-solana.ts
import { tool } from "ai";
import { z } from "zod";
import { x402Fetch } from "../x402-client";
import { env } from "../env";
import { CreditStore } from "../credits/credit-store";
import type { WalletClient } from "viem";
import type { ClusterResult, ServiceCallResult } from "./types";

interface ClusterFDeps {
  walletClient: WalletClient;
  userWallet: string | null;
}

export function createClusterFTools(deps: ClusterFDeps) {
  return {
    analyze_solana_staking: tool({
      description:
        "Analyze Solana staking options — validator scoring, risk analysis, and stake simulations. " +
        "Calls Stakevia and Mycelia Signal x402 services. " +
        "Costs ~$1.25 (Stakevia is $1.00 + SOL price feed).",
      inputSchema: z.object({
        query: z.string().describe("Staking question, e.g. 'best validators', 'compare validator X vs Y'"),
      }),
      execute: async ({ query }): Promise<ClusterResult> => {
        const maxReservationMicro = 1_500_000; // $1.50 with markup (Stakevia is $1.00 base)
        if (deps.userWallet) {
          const reservation = await CreditStore.reserve(deps.userWallet, maxReservationMicro);
          if (!reservation.success) {
            return { summary: "Insufficient credit balance for staking analysis (~$1.25). Please top up.", serviceCalls: [], totalCostMicroUsdc: 0 };
          }
        }

        const calls: ServiceCallResult[] = [];
        const errors: string[] = [];

        // Stakevia — validator scoring (main service, $1.00)
        if (env.STAKEVIA_URL) {
          try {
            const result = await x402Fetch(
              `${env.STAKEVIA_URL}/analyze?q=${encodeURIComponent(query)}`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 1_200_000 },
            );
            calls.push({ serviceName: "Stakevia", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Stakevia: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        } else {
          errors.push("Stakevia: not configured");
        }

        // Mycelia Signal — SOL price for context
        if (env.MYCELIA_URL) {
          try {
            const result = await x402Fetch(
              `${env.MYCELIA_URL}/prices?symbols=SOL`,
              undefined,
              { walletClient: deps.walletClient, maxPaymentMicroUsdc: 10_000 },
            );
            calls.push({ serviceName: "Mycelia Signal", data: result.data, costMicroUsdc: result.amountMicroUsdc, paid: result.paid });
          } catch (err) {
            errors.push(`Mycelia Signal: ${err instanceof Error ? err.message : "unavailable"}`);
          }
        }

        const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);

        if (deps.userWallet) {
          const unusedMicro = maxReservationMicro - totalCost;
          if (unusedMicro > 0) await CreditStore.release(deps.userWallet, unusedMicro);
        }

        const summary = calls.length > 0
          ? `Analyzed Solana staking using ${calls.map(c => c.serviceName).join(", ")}. ` +
            (errors.length > 0 ? `Unavailable: ${errors.join("; ")}` : "")
          : `No staking analysis services available. ${errors.join("; ")}`;

        return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost };
      },
    }),
  };
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/lib/clusters/ src/lib/env.ts
git commit -m "feat: add Cluster B (whale), D (social), F (Solana) tools"
```

---

### Task 4.5: Wire Cluster Tools into Orchestrator

**Files:**
- Modify: `src/lib/agents/orchestrator.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Read orchestrator.ts**

Read current `src/lib/agents/orchestrator.ts`.

- [ ] **Step 2: Add cluster tools to orchestrator**

Update `CreateOrchestratorOptions` to accept `walletClient` and `userWallet`, then add cluster tools:

```typescript
import { createClusterATools } from "@/lib/clusters/cluster-a-defi";
import { createClusterBTools } from "@/lib/clusters/cluster-b-whale";
import { createClusterDTools } from "@/lib/clusters/cluster-d-social";
import { createClusterFTools } from "@/lib/clusters/cluster-f-solana";
import type { WalletClient } from "viem";

interface CreateOrchestratorOptions {
  model: LanguageModel;
  mcpTools: ToolSet;
  budget: BudgetController;
  localTools?: ToolSet;
  walletClient?: WalletClient;
  /** User's wallet address for credit reservation. Null for anonymous users. */
  userWallet?: string | null;
}
```

In `createOrchestrator()`, conditionally add cluster tools. Both `walletClient` (house wallet for x402 signing) and `userWallet` (for credit reservation) must be passed to each cluster:

```typescript
const clusterDeps = options.walletClient
  ? { walletClient: options.walletClient, userWallet: options.userWallet ?? null }
  : null;

const clusterTools = clusterDeps ? {
  ...createClusterATools(clusterDeps),
  ...createClusterBTools(clusterDeps),
  ...createClusterDTools(clusterDeps),
  ...createClusterFTools(clusterDeps),
} : {};
```

Add to the `tools` spread:

```typescript
tools: {
  ...mcpTools,
  ...localTools,
  ...budgetTools,
  ...discoveryTools,
  ...clusterTools,
},
```

- [ ] **Step 3: Update orchestrator instructions**

Add cluster tools to the system prompt:

```
You also have research tools that call external x402 services:
- analyze_defi_safety ($0.12–$0.50) — rug pull detection, contract auditing
- track_whale_activity (~$0.10) — whale/smart money tracking
- analyze_social_narrative (~$0.05) — Twitter/Farcaster sentiment
- analyze_solana_staking (~$1.25) — validator analysis and staking optimization

These tools call real external x402 services and cost real USDC from the user's credit balance.
For expensive tools (>$0.50), tell the user the estimated cost before calling.
```

- [ ] **Step 4: Update chat route to pass walletClient to orchestrator**

In `src/app/api/chat/route.ts`, create a WalletClient from the house account and pass it.

**Compatibility note:** `getOrCreatePurchaserAccount()` returns a CDP-managed `toAccount()` (viem `Account` interface backed by CDP SDK signing). The existing `withAutoPayment()` in `src/lib/with-auto-payment.ts:164` already wraps this same account in `createWalletClient()` and it works at runtime for `createPaymentHeader()`. The `x402Fetch` helper uses the same `createPaymentHeader()` call, so the same pattern is valid.

```typescript
import { createWalletClient, http } from "viem";
import { getChain } from "@/lib/accounts";

// After getting purchaserAccount (same pattern as withAutoPayment):
const walletClient = createWalletClient({
  account: purchaserAccount,
  chain: getChain(),
  transport: http(),
});

const agent = createOrchestrator({
  model: getModel(modelId),
  mcpTools,
  budget,
  localTools: {},
  walletClient,
  userWallet: walletAddress, // from x-wallet-address header; null for anonymous
});
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 6: Test manually — ask "is this token safe?" and verify cluster A invocation**

Even if RugMunch/Augur URLs are not configured, the tool should return gracefully: "No DeFi safety services available."

- [ ] **Step 7: Commit**

```bash
git add src/lib/agents/orchestrator.ts src/app/api/chat/route.ts
git commit -m "feat: wire cluster tools into orchestrator for external x402 service calls"
```

---

## Phase 5: Frontend

**Goal:** Wallet connect, credit balance display, cost transparency, session receipt, and top-up UI.

---

### Task 5.1: Add Wallet Connect State

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read page.tsx**

Read `src/app/page.tsx` in full.

- [ ] **Step 2: Add wallet connect state and logic**

Add state for wallet connection. Phase 1 uses a simple EIP-1193 approach (MetaMask/injected provider). No wagmi/RainbowKit — keep it minimal.

```typescript
const [walletAddress, setWalletAddress] = useState<string | null>(null);
const [creditBalance, setCreditBalance] = useState<number | null>(null);

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("Please install MetaMask or another EVM wallet");
    return;
  }
  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  }) as string[];
  const address = accounts[0];
  setWalletAddress(address);

  // Claim free credits
  const res = await fetch("/api/credits/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
  const data = await res.json();
  setCreditBalance(data.balance ?? 0);
}
```

- [ ] **Step 3: Pass wallet address in chat requests**

The wallet address must be passed **per-call** via `sendMessage`, not via `useChat` config. The existing `page.tsx` has three `sendMessage` call sites (suggestion click, form submit, new chat). Update each one to include the header:

```typescript
// For EACH sendMessage call site in page.tsx, change from:
sendMessage({ text: "..." }, { body: { model } });
// to:
sendMessage(
  { text: "..." },
  {
    body: { model },
    headers: walletAddress ? { "x-wallet-address": walletAddress } : undefined,
  },
);
```

Find all `sendMessage(` calls in `page.tsx` and apply this pattern to each one.

- [ ] **Step 4: Add a connect wallet button to the UI**

Add a button in the header area that shows "Connect Wallet" or the truncated address:

```tsx
{walletAddress ? (
  <div className="flex items-center gap-2 text-sm">
    <span className="font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
    {creditBalance !== null && (
      <span className="text-muted-foreground">${(creditBalance / 1_000_000).toFixed(2)}</span>
    )}
  </div>
) : (
  <button onClick={connectWallet} className="text-sm px-3 py-1 rounded border">
    Connect Wallet
  </button>
)}
```

- [ ] **Step 5: Add window.ethereum type declaration**

Create a minimal type declaration at the top of `page.tsx` or a separate `src/types/ethereum.d.ts`:

```typescript
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add wallet connect button and credit balance display"
```

---

### Task 5.2: Add Free Calls Exhausted Prompt

When the anonymous user hits the 2-call limit, the chat route returns a 402. The frontend should catch this and show a wallet connect prompt.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Handle 402 response in the chat error flow**

In the error handling for the chat, detect the `FREE_CALLS_EXHAUSTED` code and show a connect prompt:

```typescript
// In the onError callback or error state rendering:
if (error?.message?.includes("FREE_CALLS_EXHAUSTED") || error?.message?.includes("Free calls exhausted")) {
  // Show wallet connect prompt instead of generic error
  return (
    <div className="text-center p-4 space-y-2">
      <p className="text-sm text-muted-foreground">
        You've used your 2 free tool calls. Connect a wallet to get up to $0.50 in free credits.
      </p>
      <button onClick={connectWallet} className="px-4 py-2 rounded bg-primary text-primary-foreground">
        Connect Wallet
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: show wallet connect prompt when free calls exhausted"
```

---

### Task 5.3: Add Session Receipt Component

After each assistant message that involved paid tool calls, show an itemized cost breakdown.

**Files:**
- Create: `src/components/ai-elements/session-receipt.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the session receipt component**

```tsx
// src/components/ai-elements/session-receipt.tsx
"use client";

interface ReceiptItem {
  toolName: string;
  amountUsdc: number;
}

interface SessionReceiptProps {
  items: ReceiptItem[];
  balanceRemaining: number;
}

export function SessionReceipt({ items, balanceRemaining }: SessionReceiptProps) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.amountUsdc, 0);

  return (
    <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs font-mono space-y-1">
      <div className="text-muted-foreground mb-1">Used this turn:</div>
      {items.map((item, i) => (
        <div key={i} className="flex justify-between">
          <span>{item.toolName.replace(/_/g, " ")}</span>
          <span>${item.amountUsdc.toFixed(3)}</span>
        </div>
      ))}
      <div className="border-t border-border pt-1 flex justify-between font-medium">
        <span>Total</span>
        <span>${total.toFixed(3)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Balance remaining</span>
        <span>${balanceRemaining.toFixed(3)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire session receipt into message rendering**

Two changes needed:

**a) In the chat route (`src/app/api/chat/route.ts`)**, update `messageMetadata` to include spend events collected during the turn. Add a `turnSpendEvents` accumulator in the route handler:

```typescript
// Before the agent call, accumulate spend events per turn:
const turnSpendEvents: Array<{ toolName: string; amountUsdc: number }> = [];

// Inside onStepFinish, after recording the SpendEvent:
turnSpendEvents.push({
  toolName: toolResult.toolName,
  amountUsdc: chargedMicro / 1_000_000,
});

// Update messageMetadata to include turn spend events:
messageMetadata: () => ({
  network: env.NETWORK,
  budgetRemaining: budget.remainingUsdc(),
  spendEvents: turnSpendEvents,
}),
```

**b) In `page.tsx`**, extract spend events from assistant message metadata and render `<SessionReceipt>`:

```tsx
// After each assistant message:
const metadata = message.metadata as { spendEvents?: Array<{ toolName: string; amountUsdc: number }>; budgetRemaining?: number } | undefined;
if (metadata?.spendEvents?.length) {
  return <SessionReceipt items={metadata.spendEvents} balanceRemaining={metadata.budgetRemaining ?? 0} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-elements/session-receipt.tsx src/app/page.tsx
git commit -m "feat: add session receipt component showing itemized costs per turn"
```

---

### Task 5.4: Cost Transparency UI

Implement the spec's three cost thresholds (spec section 5). The orchestrator already tells the AI about costs in its system prompt; this task adds client-side UX for the thresholds.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add cost confirmation state and handler**

```typescript
// In page.tsx, add state for pending cost confirmations:
const [pendingCostConfirm, setPendingCostConfirm] = useState<{
  toolName: string;
  estimatedCost: number; // in USD
  onConfirm: () => void;
  onCancel: () => void;
} | null>(null);
```

The three thresholds from the spec:

| Call cost | Behavior |
|-----------|----------|
| < $0.10 | Auto-approve, call immediately |
| $0.10–$0.50 | Show estimated cost, auto-proceed after 2s with option to cancel |
| > $0.50 | Explicit confirmation required: "This will use ~$X. Proceed?" |

- [ ] **Step 2: Add a cost confirmation banner component**

```tsx
// Inline in page.tsx or extract to a component:
function CostConfirmBanner({ toolName, estimatedCost, onConfirm, onCancel }: {
  toolName: string;
  estimatedCost: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [countdown, setCountdown] = useState(estimatedCost <= 0.50 ? 2 : null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { onConfirm(); return; }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onConfirm]);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm">
      <span>
        <strong>{toolName.replace(/_/g, " ")}</strong> will cost ~${estimatedCost.toFixed(2)}
        {countdown !== null && <span className="text-muted-foreground"> (proceeding in {countdown}s)</span>}
      </span>
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1 rounded border text-xs">Cancel</button>
        <button onClick={onConfirm} className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs">
          Proceed
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render the banner when pendingCostConfirm is set**

Place `{pendingCostConfirm && <CostConfirmBanner {...pendingCostConfirm} />}` above the prompt input area.

Note: In Phase 1, cost confirmation is advisory only — the AI agent decides whether to call tools based on its system prompt instructions. Full tool-level gating (intercept before execution) is a Phase 2 feature.

The banner is triggered by scanning the AI's streaming text for cost announcements. Add this to the `useChat` `onChunk` or message-update callback:

```typescript
// In the message rendering or streaming callback, scan assistant text:
function checkForCostAnnouncement(text: string) {
  // Match patterns like "~$1.25", "will cost $0.50", "estimated cost: $0.12"
  const costMatch = text.match(/(?:~\$|will cost[^$]*\$|estimated cost[^$]*\$|costs?\s+\$)(\d+\.?\d*)/i);
  if (!costMatch) return;
  const estimatedCost = parseFloat(costMatch[1]);
  if (estimatedCost < 0.10) return; // auto-approve threshold

  setPendingCostConfirm({
    toolName: "research tool", // extracted from context if possible
    estimatedCost,
    onConfirm: () => setPendingCostConfirm(null),
    onCancel: () => {
      setPendingCostConfirm(null);
      // Optionally send a "cancel" message to stop the agent
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add cost transparency UI with three-tier confirmation thresholds"
```

---

### Task 5.5: Update Suggestions for Phase 1

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace suggestions with Phase 1 research-oriented prompts**

```typescript
const suggestions = {
  "Is this token safe?": "Analyze the safety of contract 0x...",
  "Whale activity": "What are whales buying right now?",
  "Crypto sentiment": "What's the narrative around Solana on Twitter and Farcaster?",
  "Check price ($0.01)": "What's the current price of Ethereum?",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update suggestions for Phase 1 research clusters"
```

---

## Verification

### Task 6.1: End-to-End Manual Test

- [ ] **Step 1: Set up Neon database**

Create a Neon project, run `src/lib/db-schema.sql` against it, set `DATABASE_URL` in `.env.local`.

- [ ] **Step 2: Start dev server**

Run: `pnpm dev`

- [ ] **Step 3: Test anonymous flow**

1. Open app (no wallet connected)
2. Send 2 messages — both should work
3. Third message should show "Connect wallet" prompt

- [ ] **Step 4: Test wallet connect + free credits**

1. Click "Connect Wallet"
2. Approve in MetaMask
3. Verify credit balance appears in UI
4. Send a message — should use credit balance

- [ ] **Step 5: Test cluster tools (with no external services configured)**

Ask "Is this token safe?" — should invoke `analyze_defi_safety` tool, which should gracefully report services not configured.

- [ ] **Step 6: Test existing paid tools still work**

Ask "What's the price of Bitcoin?" — existing `get_crypto_price` MCP tool should work with session receipt.

- [ ] **Step 7: Run full typecheck and test suite**

```bash
pnpm typecheck && pnpm test
```

---

## Recommended Execution Order

```
Phase 1 (Tasks 1.1 → 1.6) — sequential, DB foundation
    │
    ▼
Phase 2 (Tasks 2.1 → 2.2) — sequential, session/credit integration
    │
    ├──── Phase 3 (Tasks 3.1 → 3.4) — credit APIs (independent of Phase 4)
    │
    └──── Phase 4 (Tasks 4.1 → 4.5) — x402 client + clusters (independent of Phase 3)
              │
              ▼
         Phase 5 (Tasks 5.1 → 5.5) — frontend (needs Phases 2 + 3)

Phase 6 (Task 6.1) — verification after all phases
```

**Parallelization:** Phases 3 and 4 can run in parallel after Phase 2, but both modify `src/lib/env.ts`. If using subagents, assign env.ts changes to one agent and let the other defer its env changes.
