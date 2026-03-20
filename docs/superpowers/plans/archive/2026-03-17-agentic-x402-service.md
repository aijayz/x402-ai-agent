# Agentic x402-Powered Service — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform this x402 demo into a production-grade AI agent that autonomously discovers, evaluates, budgets, and pays for external x402-enabled API services.

**Architecture:** Multi-agent orchestrator pattern. A `ToolLoopAgent` orchestrator delegates to discovery and execution sub-agents. A `BudgetController` enforces per-session/per-user spend limits. An x402 service registry enables runtime tool discovery. AI Gateway provides model reliability and cost tracking.

**Tech Stack:** Next.js 15, AI SDK v6 (`ToolLoopAgent`, `streamText`), x402-mcp, CDP SDK, Neon Postgres (registry + audit), Vercel AI Gateway, Zod.

---

## Scope & Phase Overview

This plan covers 6 independent phases. Each phase produces working, testable software on its own. Phases 1-2 are prerequisites; Phases 3-6 can be parallelized after Phase 2.

| Phase | Name | Purpose | Depends On |
|-------|------|---------|------------|
| 1 | Stabilize & Harden | Fix bugs, clean dead code, enable type checking | — |
| 2 | Budget Controller | Per-session/user spend limits, payment audit trail | Phase 1 |
| 3 | Multi-Agent Architecture | ToolLoopAgent orchestrator + sub-agents | Phase 2 |
| 4 | Service Discovery Registry | x402 API registry, runtime MCP probing | Phase 2 |
| 5 | AI Gateway & Observability | Multi-provider fallback, structured payment logging | Phase 1 |
| 6 | Durable Agents | Workflow DevKit for long-running tasks | Phase 3 |

---

## Phase 1: Stabilize & Harden

**Goal:** Fix known bugs, remove dead code, enable type safety.

**Files overview:**
- Modify: `src/app/api/chat/route.ts` (MCP client cleanup)
- Modify: `src/lib/env.ts` (remove unused vars)
- Modify: `src/lib/accounts.ts` (async faucet, error handling)
- Modify: `next.config.ts` (enable type checking)
- Modify: `src/app/mcp/route.ts` (no changes needed, just verify)
- Modify: `src/app/page.tsx` (fix @ts-expect-error suppressions)
- Delete: unused env vars from `.env.example`

---

### Task 1.1: Fix MCP Client Leak in Chat Route

The MCP client is created per-request but only closed in `onFinish`. If the stream errors or the client disconnects, the client leaks.

**Files:**
- Modify: `src/app/api/chat/route.ts:41-131`

- [ ] **Step 1: Read the current chat route**

Read `src/app/api/chat/route.ts` to understand the current MCP client lifecycle.

- [ ] **Step 2: Add try/finally cleanup for MCP client**

Wrap the entire handler body in try/finally so `mcpClient.close()` always runs:

The actual `withPayment` API from `x402-mcp@0.0.5` takes two arguments: `(mcpClient, options)` where `account` goes inside the options object. The current working code (lines 46-50) already uses this shape correctly.

**Important:** Use a `closed` guard to prevent double-close — `onFinish` may fire after the catch block in some error scenarios.

```typescript
export async function POST(request: Request) {
  // ... validation ...
  const purchaserAccount = await getOrCreatePurchaserAccount();
  const baseMcpClient = await createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL("/mcp", env.URL)),
  });

  // withPayment uses 2-arg form: (client, options) — account is INSIDE options
  const mcpClient = await withPayment(baseMcpClient as any, {
    account: purchaserAccount,
    network: env.NETWORK,
    maxPaymentValue: 0.1 * 10 ** 6, // Max $0.10 USDC per tool call
  });

  let closed = false;
  const closeMcp = async () => {
    if (closed) return;
    closed = true;
    await mcpClient.close();
  };

  try {
    const tools = await mcpClient.tools();

    const result = streamText({
      // ... existing config ...
      onFinish: closeMcp,
      onError: closeMcp,
    });

    return result.toUIMessageStreamResponse({
      sendSources: true,
      sendReasoning: true,
    });
  } catch (error) {
    await closeMcp();
    throw error;
  }
}
```

- [ ] **Step 3: Run typecheck to verify**

Run: `pnpm typecheck`

- [ ] **Step 4: Test manually — send a chat message, verify it streams back**

Run: `pnpm dev` and open `http://localhost:3000`. Send "hello" and confirm streaming works.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "fix: ensure MCP client cleanup on stream errors"
```

---

### Task 1.2: Remove Dead Environment Variables

`EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`, `EVM_NETWORK`, `SOLANA_NETWORK` are defined in `env.ts` and `.env.example` but never used anywhere in the codebase.

**Files:**
- Modify: `src/lib/env.ts:1-64`
- Modify: `.env.example`

- [ ] **Step 1: Read env.ts and .env.example**

Read both files to confirm which vars are unused.

- [ ] **Step 2: Remove unused vars from env.ts**

Remove `EVM_PRIVATE_KEY`, `EVM_NETWORK`, `SVM_PRIVATE_KEY`, `SOLANA_NETWORK` from both the `server` schema and `runtimeEnv`. Keep only:
- `CDP_WALLET_SECRET`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`
- `DEEPSEEK_API_KEY`
- `NETWORK`, `URL`

- [ ] **Step 3: Remove unused vars from .env.example**

Remove the self-managed wallet lines. Keep only CDP, DeepSeek, and Network vars.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "chore: remove unused EVM/SVM environment variables"
```

---

### Task 1.3: Move Faucet Call Out of Request Path

`getOrCreatePurchaserAccount()` calls the faucet inline, blocking the request for 5-30 seconds. Move faucet to a background warm-up.

**Files:**
- Modify: `src/lib/accounts.ts:1-74`

- [ ] **Step 1: Read accounts.ts**

Read the full file to understand faucet logic.

- [ ] **Step 2: Split account creation from faucet funding**

Separate `getOrCreatePurchaserAccount()` into two functions:
1. `getOrCreatePurchaserAccount()` — returns account immediately, no faucet
2. `ensurePurchaserFunded()` — checks balance, calls faucet if needed (call in background)

**Important:** Use the exact CDP SDK APIs from the current `accounts.ts`. The actual code uses `account.listTokenBalances()` (not `account.getBalance()`), and `getPublicClient()` (module-level private function, not `publicClient(chain)`).

```typescript
// Cache the raw CDP account object (before viem wrapping)
let cachedPurchaserAccount: Awaited<
  ReturnType<CdpClient["evm"]["getOrCreateAccount"]>
> | null = null;

export async function getOrCreatePurchaserAccount(): Promise<Account> {
  if (cachedPurchaserAccount) return toAccount(cachedPurchaserAccount);
  const cdpClient = getCdpClient();
  cachedPurchaserAccount = await cdpClient.evm.getOrCreateAccount({
    name: "Purchaser",
  });
  // Fire-and-forget faucet funding — do NOT block the request
  ensurePurchaserFunded(cdpClient, cachedPurchaserAccount).catch((err) =>
    console.error("Faucet funding failed:", err)
  );
  return toAccount(cachedPurchaserAccount);
}

async function ensurePurchaserFunded(
  cdpClient: CdpClient,
  account: Awaited<ReturnType<CdpClient["evm"]["getOrCreateAccount"]>>
) {
  if (env.NETWORK !== "base-sepolia") return;

  // Use the ACTUAL CDP SDK API: account.listTokenBalances()
  const balances = await account.listTokenBalances({
    network: env.NETWORK,
  });
  const usdcBalance = balances.balances.find(
    (balance) => balance.token.symbol === "USDC"
  );
  if (usdcBalance && Number(usdcBalance.amount) >= 500000) return;

  console.log("Requesting faucet funds for purchaser wallet...");
  const { transactionHash } = await cdpClient.evm.requestFaucet({
    address: account.address,
    network: env.NETWORK,
    token: "usdc",
  });
  // Use the ACTUAL private helper: getPublicClient()
  const publicClient = getPublicClient();
  const tx = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (tx.status !== "success") {
    throw new Error("Failed to receive funds from faucet");
  }
  console.log("Faucet funded purchaser wallet");
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Test — first message should not block on faucet**

Start dev server, send a message. It should respond quickly even if faucet is running in background.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounts.ts
git commit -m "perf: move faucet funding out of request path"
```

---

### Task 1.4: Enable TypeScript and ESLint in Builds

**Files:**
- Modify: `next.config.ts:1-17`

- [ ] **Step 1: Read next.config.ts**

- [ ] **Step 2: Remove ignoreBuildErrors and ignoreDuringBuilds**

```typescript
const nextConfig: NextConfig = {
  // Type errors and lint issues should fail the build
};
```

- [ ] **Step 3: Run build to find type errors**

Run: `pnpm build`
Expected: May fail with type errors. Fix them.

- [ ] **Step 4: Fix any type errors found**

Common fixes needed:
- `deepseek(deepseekModel) as any` in `route.ts` — use proper typing
- `@ts-expect-error` in `tool.tsx` and `page.tsx` — fix or add proper type guards

- [ ] **Step 5: Run build again to confirm clean**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts src/
git commit -m "chore: enable TypeScript and ESLint checking in builds"
```

---

### Task 1.5: Consolidate Duplicate Imports and Clean Unused Exports

**Files:**
- Modify: `src/app/api/chat/route.ts` (duplicate `from "ai"` imports)
- Modify: `src/components/ai-elements/message.tsx` (unused `MessageAvatar`)

- [ ] **Step 1: Merge duplicate imports in chat route**

Lines 1 and 5 both import from `"ai"`. Merge into one import statement.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "chore: consolidate duplicate imports"
```

---

## Phase 2: Budget Controller & Payment Audit

**Goal:** Enforce per-session and per-user spend limits. Record every payment for auditability.

**Files overview:**
- Create: `src/lib/budget-controller.ts`
- Create: `src/lib/payment-store.ts`
- Create: `src/lib/budget-controller.test.ts`
- Modify: `src/app/api/chat/route.ts` (wire budget into withPayment)

---

### Task 2.1: Design and Implement BudgetController

**Files:**
- Create: `src/lib/budget-controller.ts`
- Create: `src/lib/__tests__/budget-controller.test.ts`

- [ ] **Step 1: Write the failing test for BudgetController**

```typescript
// src/lib/__tests__/budget-controller.test.ts
import { describe, it, expect } from "vitest";
import { BudgetController } from "../budget-controller";

describe("BudgetController", () => {
  it("allows spend within session limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    expect(bc.canSpend(0.5)).toEqual({ allowed: true });
  });

  it("rejects spend exceeding session limit", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(0.8, "tool-a", "0xabc");
    expect(bc.canSpend(0.5)).toEqual({
      allowed: false,
      reason: "Session limit of $1.00 would be exceeded (spent: $0.80, requested: $0.50)",
    });
  });

  it("tracks remaining budget", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(0.3, "tool-a", "0xabc");
    expect(bc.remainingUsdc()).toBe(0.7);
  });

  it("records payment history", () => {
    const bc = new BudgetController({ sessionLimitUsdc: 1.0 });
    bc.recordSpend(0.01, "premium_random", "0xdef");
    const history = bc.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      toolName: "premium_random",
      amountUsdc: 0.01,
      txHash: "0xdef",
    });
  });
});
```

- [ ] **Step 2: Install vitest as dev dependency**

Run: `pnpm add -D vitest`

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/lib/__tests__/budget-controller.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement BudgetController**

```typescript
// src/lib/budget-controller.ts

interface PaymentRecord {
  toolName: string;
  amountUsdc: number;
  txHash: string;
  timestamp: Date;
}

interface BudgetControllerOptions {
  sessionLimitUsdc: number;
}

export class BudgetController {
  private spent = 0;
  private history: PaymentRecord[] = [];
  private readonly sessionLimitUsdc: number;

  constructor(options: BudgetControllerOptions) {
    this.sessionLimitUsdc = options.sessionLimitUsdc;
  }

  canSpend(amountUsdc: number): { allowed: boolean; reason?: string } {
    if (this.spent + amountUsdc > this.sessionLimitUsdc) {
      return {
        allowed: false,
        reason: `Session limit of $${this.sessionLimitUsdc.toFixed(2)} would be exceeded (spent: $${this.spent.toFixed(2)}, requested: $${amountUsdc.toFixed(2)})`,
      };
    }
    return { allowed: true };
  }

  recordSpend(amountUsdc: number, toolName: string, txHash: string) {
    this.spent += amountUsdc;
    this.history.push({
      toolName,
      amountUsdc,
      txHash,
      timestamp: new Date(),
    });
  }

  remainingUsdc(): number {
    return this.sessionLimitUsdc - this.spent;
  }

  getHistory(): ReadonlyArray<PaymentRecord> {
    return this.history;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/lib/__tests__/budget-controller.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/budget-controller.ts src/lib/__tests__/budget-controller.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add BudgetController with session spend limits"
```

---

### Task 2.2: Wire BudgetController into Chat Route with Actual Enforcement

The budget must be **enforced**, not just mentioned in the system prompt. We need to:
1. Track actual spend from x402 payment responses
2. Block tool calls that would exceed the budget

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Read chat route and x402-mcp client types**

Read `src/app/api/chat/route.ts`. Also check how `withPayment` reports completed payments — look at the tool output's `_meta["x402.payment-response"]` field (already rendered in `tool.tsx`).

- [ ] **Step 2: Add BudgetController and wire into onStepFinish**

Create a session-scoped BudgetController and use `onStepFinish` to capture payment events after each tool call:

```typescript
import { BudgetController } from "@/lib/budget-controller";

// In POST handler, before creating MCP client:
const budget = new BudgetController({ sessionLimitUsdc: 0.50 }); // $0.50 per session
```

- [ ] **Step 3: Capture payments via onStepFinish callback**

After each step, inspect tool results for x402 payment metadata and record spend:

```typescript
const result = streamText({
  // ... existing config ...
  system: `You are an x402 AI agent with a USDC budget of $${budget.remainingUsdc().toFixed(2)} for this session.
Before calling paid tools, consider the cost. Use check_budget to see remaining funds.`,
  onStepFinish: async ({ toolResults }) => {
    // Inspect each tool result for x402 payment metadata
    for (const toolResult of toolResults ?? []) {
      const output = toolResult.result as Record<string, unknown> | undefined;
      const meta = output?._meta as Record<string, unknown> | undefined;
      const paymentResponse = meta?.["x402.payment-response"] as
        | { transaction?: string; amount?: number }
        | undefined;
      if (paymentResponse?.transaction) {
        // Convert micro-USDC to USDC (amounts are in 10^6 units)
        const amountUsdc = (paymentResponse.amount ?? 0) / 1e6;
        budget.recordSpend(amountUsdc, toolResult.toolName, paymentResponse.transaction);
      }
    }
  },
});
```

- [ ] **Step 4: Add budget check tool so the agent can self-regulate**

Add a `check_budget` tool alongside the MCP tools:

```typescript
tools: {
  ...mcpTools,
  "hello-local": helloLocalTool,
  check_budget: tool({
    description: "Check remaining USDC budget for this session",
    inputSchema: z.object({}),
    execute: async () => ({
      remainingUsdc: budget.remainingUsdc(),
      spentUsdc: budget.sessionLimitUsdc - budget.remainingUsdc(),
      history: budget.getHistory(),
    }),
  }),
},
```

- [ ] **Step 5: Test budget tracking end-to-end**

1. Send "Get me a premium random number" ($0.01) — verify budget decreases
2. Send "Check your budget" — agent should report ~$0.49 remaining
3. Verify `budget.getHistory()` contains the tx hash

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: wire BudgetController with actual payment tracking via onStepFinish"
```

> **Known limitation:** Budget enforcement at this stage is advisory — the agent is told its budget and can check it, but `withPayment()` will still sign payments even if over budget. Hard enforcement (rejecting the EIP-3009 signature) requires wrapping `withPayment` or patching `x402-mcp` — deferred to a follow-up task.

---

## Phase 3: Multi-Agent Architecture

**Goal:** Replace single `streamText` with `ToolLoopAgent` orchestrator pattern.

**Files overview:**
- Create: `src/lib/agents/orchestrator.ts`
- Create: `src/lib/agents/tools.ts`
- Modify: `src/app/api/chat/route.ts` (use ToolLoopAgent + createAgentUIStreamResponse)

---

### Task 3.1: Create Agent Tools Module

**Files:**
- Create: `src/lib/agents/tools.ts`

- [ ] **Step 1: Create the tools module**

Define the orchestrator's meta-tools (check_budget, plan_task, summarize):

```typescript
// src/lib/agents/tools.ts
import { tool } from "ai";
import { z } from "zod";
import type { BudgetController } from "@/lib/budget-controller";

export function createBudgetTools(budget: BudgetController) {
  return {
    check_budget: tool({
      description: "Check remaining USDC budget for this session",
      inputSchema: z.object({}),
      execute: async () => ({
        remainingUsdc: budget.remainingUsdc(),
        history: budget.getHistory(),
      }),
    }),
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/tools.ts
git commit -m "feat: add agent budget tools"
```

---

### Task 3.2: Create ToolLoopAgent Orchestrator

**Files:**
- Create: `src/lib/agents/orchestrator.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Create the orchestrator agent**

**Important:** `ToolLoopAgent` requires a `LanguageModel` object for the `model` parameter, NOT a plain string. At Phase 3, we still use `@ai-sdk/deepseek` (gateway strings come in Phase 5). Pass the typed provider object from the chat route.

```typescript
// src/lib/agents/orchestrator.ts
import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel, Tool } from "ai";
import type { BudgetController } from "@/lib/budget-controller";
import { createBudgetTools } from "./tools";

interface CreateOrchestratorOptions {
  model: LanguageModel; // Must be a LanguageModel object, NOT a string
  mcpTools: Record<string, Tool>;
  budget: BudgetController;
  localTools?: Record<string, Tool>;
}

export function createOrchestrator({
  model,
  mcpTools,
  budget,
  localTools = {},
}: CreateOrchestratorOptions) {
  const budgetTools = createBudgetTools(budget);

  return new ToolLoopAgent({
    model,
    instructions: `You are an autonomous x402 AI agent with a USDC budget of $${budget.remainingUsdc().toFixed(2)} for this session.

You can call paid tools that cost real USDC on the Base blockchain. Before calling expensive tools:
1. Check your remaining budget with check_budget
2. Consider if the tool's value justifies its cost
3. Prefer free tools when they can accomplish the task

Be transparent about costs — tell the user what you're spending and why.`,
    tools: {
      ...mcpTools,
      ...localTools,
      ...budgetTools,
    },
    stopWhen: stepCountIs(10),
  });
}
```

- [ ] **Step 2: Update chat route to use createAgentUIStreamResponse**

Replace the `streamText` call with `createAgentUIStreamResponse`. **Important:** Pass a `LanguageModel` object (not a string) and preserve the MCP client cleanup from Task 1.1.

```typescript
import { createAgentUIStreamResponse } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import { createOrchestrator } from "@/lib/agents/orchestrator";

// In POST handler (inside the try block from Task 1.1):
const agent = createOrchestrator({
  model: deepseek(deepseekModel), // LanguageModel object, NOT a string
  mcpTools: tools,
  budget,
  localTools: { "hello-local": helloLocalTool },
});

// createAgentUIStreamResponse does NOT have onFinish/onError callbacks.
// MCP cleanup is handled by the try/catch/closeMcp pattern from Task 1.1.
// The closeMcp() in the catch block handles errors. For successful completion,
// use the Response body's cancel signal:
const response = createAgentUIStreamResponse({
  agent,
  uiMessages: messages,
});

// Register cleanup when the response stream finishes or aborts
response.body?.pipeTo(new WritableStream()).catch(() => {}).finally(closeMcp);

return response;
```

**Note:** If `createAgentUIStreamResponse` does not work with DeepSeek, fall back to `agent.stream()` + `toUIMessageStreamResponse()` which supports `onFinish`/`onError` callbacks directly.

**Phase 5 migration:** When switching to AI Gateway (Phase 5), change `model: deepseek(deepseekModel)` to `model: env.AI_MODEL` (plain gateway string). At that point, `ToolLoopAgent` accepts gateway strings natively since the gateway provider resolves them to `LanguageModel` objects.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Test manually — full chat flow with agent**

Test: Send "Get me a premium random number" — agent should check budget, call the tool, report the cost.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/ src/app/api/chat/route.ts
git commit -m "feat: replace streamText with ToolLoopAgent orchestrator"
```

---

## Phase 4: Service Discovery Registry

**Goal:** Enable the agent to discover and connect to external x402-enabled APIs at runtime.

**Files overview:**
- Create: `src/lib/registry/types.ts`
- Create: `src/lib/registry/store.ts` (in-memory to start, Postgres later)
- Create: `src/lib/registry/discovery-tools.ts`
- Create: `src/app/api/registry/route.ts`
- Modify: `src/lib/agents/orchestrator.ts` (add discovery tools)

---

### Task 4.1: Define Registry Types

**Files:**
- Create: `src/lib/registry/types.ts`

- [ ] **Step 1: Create registry type definitions**

```typescript
// src/lib/registry/types.ts
export interface X402Service {
  id: string;
  name: string;
  baseUrl: string;
  mcpPath: string;
  description: string;
  categories: string[];
  verified: boolean;
  createdAt: Date;
}

export interface X402ServiceTool {
  id: string;
  serviceId: string;
  toolName: string;
  priceUsdc: number;
  description: string;
  inputSchema: Record<string, unknown>;
  lastSeen: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/registry/types.ts
git commit -m "feat: add x402 service registry types"
```

---

### Task 4.2: Implement In-Memory Registry Store

**Files:**
- Create: `src/lib/registry/store.ts`
- Create: `src/lib/registry/__tests__/store.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/registry/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { RegistryStore } from "../store";

describe("RegistryStore", () => {
  let store: RegistryStore;

  beforeEach(() => {
    store = new RegistryStore();
  });

  it("registers and retrieves a service", () => {
    const service = store.register({
      name: "Weather API",
      baseUrl: "https://weather.example.com",
      mcpPath: "/mcp",
      description: "Real-time weather data",
      categories: ["weather"],
    });
    expect(store.getById(service.id)).toMatchObject({ name: "Weather API" });
  });

  it("searches by category", () => {
    store.register({ name: "Weather", baseUrl: "https://a.com", mcpPath: "/mcp", description: "Weather", categories: ["weather"] });
    store.register({ name: "Finance", baseUrl: "https://b.com", mcpPath: "/mcp", description: "Finance", categories: ["finance"] });
    const results = store.search({ categories: ["weather"] });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Weather");
  });

  it("searches by text query", () => {
    store.register({ name: "Premium Weather", baseUrl: "https://a.com", mcpPath: "/mcp", description: "High quality weather forecasts", categories: ["weather"] });
    const results = store.search({ query: "forecast" });
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- src/lib/registry/__tests__/store.test.ts`

- [ ] **Step 3: Implement RegistryStore**

```typescript
// src/lib/registry/store.ts
import { randomUUID } from "crypto";
import type { X402Service } from "./types";

interface RegisterInput {
  name: string;
  baseUrl: string;
  mcpPath: string;
  description: string;
  categories: string[];
}

interface SearchOptions {
  query?: string;
  categories?: string[];
  maxPricePerCall?: number;
}

export class RegistryStore {
  private services: Map<string, X402Service> = new Map();

  register(input: RegisterInput): X402Service {
    const service: X402Service = {
      id: randomUUID(),
      ...input,
      verified: false,
      createdAt: new Date(),
    };
    this.services.set(service.id, service);
    return service;
  }

  getById(id: string): X402Service | undefined {
    return this.services.get(id);
  }

  search(options: SearchOptions): X402Service[] {
    let results = Array.from(this.services.values());

    if (options.categories?.length) {
      results = results.filter((s) =>
        s.categories.some((c) => options.categories!.includes(c))
      );
    }

    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    return results;
  }

  listAll(): X402Service[] {
    return Array.from(this.services.values());
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/lib/registry/__tests__/store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/registry/
git commit -m "feat: add in-memory x402 service registry"
```

---

### Task 4.3: Create Discovery Tools for the Agent

**Files:**
- Create: `src/lib/registry/discovery-tools.ts`

- [ ] **Step 1: Implement discovery tools**

```typescript
// src/lib/registry/discovery-tools.ts
import { tool } from "ai";
import { z } from "zod";
import { createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RegistryStore } from "./store";

export function createDiscoveryTools(registry: RegistryStore) {
  return {
    search_x402_services: tool({
      description: "Search the registry for x402-enabled APIs that can help with a task",
      inputSchema: z.object({
        query: z.string().describe("What kind of service are you looking for?"),
        categories: z.array(z.string()).optional(),
      }),
      execute: async ({ query, categories }) => {
        const results = registry.search({ query, categories });
        return {
          services: results.map((s) => ({
            id: s.id,
            name: s.name,
            baseUrl: s.baseUrl,
            description: s.description,
            categories: s.categories,
            verified: s.verified,
          })),
        };
      },
    }),

    probe_x402_service: tool({
      description: "Connect to an x402 MCP server to discover its available tools and prices",
      inputSchema: z.object({
        baseUrl: z.string().url(),
        mcpPath: z.string().default("/mcp"),
      }),
      execute: async ({ baseUrl, mcpPath }) => {
        const client = await createMCPClient({
          transport: new StreamableHTTPClientTransport(new URL(mcpPath, baseUrl)),
        });
        try {
          const tools = await client.tools();
          return {
            toolCount: Object.keys(tools).length,
            tools: Object.entries(tools).map(([name, t]) => ({
              name,
              description: (t as { description?: string }).description ?? "No description",
            })),
          };
        } finally {
          await client.close();
        }
      },
    }),

    list_registered_services: tool({
      description: "List all known x402 services in the registry",
      inputSchema: z.object({}),
      execute: async () => ({
        services: registry.listAll().map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          verified: s.verified,
        })),
      }),
    }),
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/registry/discovery-tools.ts
git commit -m "feat: add x402 service discovery tools for agent"
```

---

### Task 4.4: Seed Registry with Known Services

**Files:**
- Create: `src/lib/registry/seed.ts`
- Modify: `src/lib/agents/orchestrator.ts` (add discovery tools)

- [ ] **Step 1: Create seed file with the local MCP server + any known x402 services**

```typescript
// src/lib/registry/seed.ts
import type { RegistryStore } from "./store";
import { env } from "@/lib/env";

export function seedRegistry(registry: RegistryStore) {
  // Register our own MCP server
  registry.register({
    name: "x402 Demo Tools",
    baseUrl: env.URL,
    mcpPath: "/mcp",
    description: "Demo x402 tools: random numbers, math, premium analysis",
    categories: ["demo", "math"],
  });
}
```

- [ ] **Step 2: Wire discovery tools into orchestrator**

Add discovery tools to the orchestrator's tool set in `createOrchestrator()`.

- [ ] **Step 3: Test manually — ask agent "what services are available?"**

The agent should use `list_registered_services` and describe available tools.

- [ ] **Step 4: Commit**

```bash
git add src/lib/registry/seed.ts src/lib/agents/orchestrator.ts
git commit -m "feat: seed registry and wire discovery into orchestrator"
```

---

### Task 4.5: Add Service Registration API

**Files:**
- Modify: `src/lib/registry/store.ts` (add singleton)
- Create: `src/app/api/registry/route.ts`

- [ ] **Step 1: Export a singleton getRegistry() from store.ts FIRST**

Add to `src/lib/registry/store.ts` (must exist before the route imports it):
```typescript
let _registry: RegistryStore | null = null;
export function getRegistry(): RegistryStore {
  if (!_registry) _registry = new RegistryStore();
  return _registry;
}
```

> **Known limitation:** This in-memory singleton resets on every Vercel serverless cold start. Services registered via POST will not persist across deployments or cold starts. The `seedRegistry()` call (Task 4.4) re-populates known services on startup. For production, migrate to Neon Postgres — this is explicitly deferred to a follow-up task.

- [ ] **Step 2: Create the registration endpoint**

```typescript
// src/app/api/registry/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry } from "@/lib/registry/store";

const RegisterSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  mcpPath: z.string().default("/mcp"),
  description: z.string().min(1),
  categories: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = getRegistry().register(parsed.data);
  return NextResponse.json(service, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ services: getRegistry().listAll() });
}
```

- [ ] **Step 3: Test with curl**

```bash
curl -X POST http://localhost:3000/api/registry \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","baseUrl":"https://example.com","mcpPath":"/mcp","description":"Test service","categories":["test"]}'
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/registry/route.ts src/lib/registry/store.ts
git commit -m "feat: add x402 service registration API"
```

---

## Phase 5: AI Gateway & Observability

**Goal:** Replace hardcoded DeepSeek with AI Gateway for multi-provider fallback and cost tracking. Add structured payment event logging.

**Files overview:**
- Modify: `src/lib/env.ts` (add AI Gateway env vars)
- Create: `src/lib/telemetry.ts`
- Modify: `src/app/api/chat/route.ts` (use gateway model strings)
- Modify: `src/lib/agents/orchestrator.ts` (gateway model)
- Modify: `package.json` (add @ai-sdk/gateway if explicit wrapper needed)

---

### Task 5.1: Add AI Gateway Model Configuration

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Update env.ts with model configuration**

Add `AI_MODEL` env var (default: `"deepseek/deepseek-chat"` for gateway routing):

```typescript
AI_MODEL: z.string().default("deepseek/deepseek-chat"),
AI_REASONING_MODEL: z.string().default("deepseek/deepseek-reasoner"),
```

- [ ] **Step 2: Update chat route to use gateway model strings**

Replace `deepseek(deepseekModel)` with plain gateway string:
```typescript
const modelId = model === "deepseek-reasoner" ? env.AI_REASONING_MODEL : env.AI_MODEL;
// Use as: model: modelId (plain string routes through AI Gateway)
```

- [ ] **Step 3: Keep @ai-sdk/deepseek as local dev fallback**

AI Gateway requires a Vercel project with gateway enabled + OIDC token (from `vercel env pull`). For local dev without gateway, keep `@ai-sdk/deepseek` as a fallback:

```typescript
// src/lib/ai-provider.ts
import { deepseek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

export function getModel(modelId: string): LanguageModel {
  // On Vercel, OIDC token exists — use gateway strings directly
  if (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY) {
    return modelId as unknown as LanguageModel; // Gateway resolves the string
  }
  // Local dev fallback — use direct DeepSeek provider
  const deepseekModelName = modelId.replace("deepseek/", "");
  return deepseek(deepseekModelName);
}
```

Do NOT remove `@ai-sdk/deepseek` until the project has gateway fully configured and `vercel env pull` is part of the dev setup.

- [ ] **Step 4: Test locally and document setup**

Local dev: Ensure `DEEPSEEK_API_KEY` is in `.env.local` — direct provider works.
Vercel: Run `vercel link` + enable AI Gateway + `vercel env pull` — gateway strings work.

Update `.env.example` with:
```bash
# AI Model Configuration (gateway format: provider/model)
AI_MODEL=deepseek/deepseek-chat
AI_REASONING_MODEL=deepseek/deepseek-reasoner

# For local dev without AI Gateway, keep DEEPSEEK_API_KEY
DEEPSEEK_API_KEY=
# For Vercel/Gateway: run `vercel env pull` to get OIDC token
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/app/api/chat/route.ts package.json pnpm-lock.yaml
git commit -m "feat: switch from direct DeepSeek to AI Gateway model strings"
```

---

### Task 5.2: Add Structured Payment Telemetry

**Files:**
- Create: `src/lib/telemetry.ts`

- [ ] **Step 1: Create telemetry module**

```typescript
// src/lib/telemetry.ts
interface PaymentEvent {
  event: string;
  toolName: string;
  amountUsdc?: number;
  txHash?: string;
  network?: string;
  timestamp: string;
}

export const telemetry = {
  toolCallInitiated(toolName: string, priceUsdc: number) {
    const event: PaymentEvent = {
      event: "tool_call_initiated",
      toolName,
      amountUsdc: priceUsdc,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(event));
  },

  paymentSettled(toolName: string, amountUsdc: number, txHash: string, network: string) {
    const event: PaymentEvent = {
      event: "payment_settled",
      toolName,
      amountUsdc,
      txHash,
      network,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(event));
  },

  budgetExceeded(toolName: string, requestedUsdc: number, remainingUsdc: number) {
    console.log(
      JSON.stringify({
        event: "budget_exceeded",
        toolName,
        requestedUsdc,
        remainingUsdc,
        timestamp: new Date().toISOString(),
      })
    );
  },
};
```

- [ ] **Step 2: Wire telemetry into BudgetController**

Update `budget-controller.ts` to emit telemetry events on `recordSpend` and failed `canSpend`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telemetry.ts src/lib/budget-controller.ts
git commit -m "feat: add structured payment telemetry logging"
```

---

## Phase 6: Durable Agents (Future)

**Goal:** Use Workflow DevKit `DurableAgent` for long-running research tasks that survive crashes.

> This phase requires `@vercel/workflow-devkit` and a Vercel project with AI Gateway OIDC configured. It should be implemented after Phases 3-5 are stable.

**High-level plan (detailed tasks to be written when Phase 3 is complete):**

1. Install Workflow DevKit: `pnpm add @vercel/workflow-devkit`
2. Create `src/app/api/agent/route.ts` — durable agent endpoint
3. Create `src/app/api/agent/[runId]/route.ts` — status polling
4. Wrap orchestrator in `DurableAgent.start()`
5. Add UI for async task status (polling, spend ticker, intermediate results)
6. Add `defineHook()` for human-in-the-loop approval on high-cost tool calls

---

## File Map Summary

| File | Action | Phase |
|------|--------|-------|
| `src/app/api/chat/route.ts` | Modify | 1, 2, 3, 5 |
| `src/app/mcp/route.ts` | Verify | 1 |
| `src/lib/env.ts` | Modify | 1, 5 |
| `src/lib/accounts.ts` | Modify | 1 |
| `src/app/page.tsx` | Modify | 1 |
| `next.config.ts` | Modify | 1 |
| `.env.example` | Modify | 1, 5 |
| `src/lib/budget-controller.ts` | Create | 2 |
| `src/lib/__tests__/budget-controller.test.ts` | Create | 2 |
| `src/lib/agents/orchestrator.ts` | Create | 3, 4 |
| `src/lib/agents/tools.ts` | Create | 3 |
| `src/lib/registry/types.ts` | Create | 4 |
| `src/lib/registry/store.ts` | Create | 4 |
| `src/lib/registry/discovery-tools.ts` | Create | 4 |
| `src/lib/registry/seed.ts` | Create | 4 |
| `src/lib/registry/__tests__/store.test.ts` | Create | 4 |
| `src/app/api/registry/route.ts` | Create | 4 |
| `src/lib/telemetry.ts` | Create | 5 |

---

## Recommended Execution Order

```
Phase 1 (Tasks 1.1 → 1.5) — sequential
    │
    ▼
Phase 2 (Tasks 2.1 → 2.2) — sequential
    │
    ▼
Phase 3 (Tasks 3.1 → 3.2) — ToolLoopAgent with deepseek() provider
    │
    ├──── Phase 4 (Tasks 4.1 → 4.5) — can start after Phase 3
    │         (4.4 wires discovery tools into orchestrator)
    │
    └──── Phase 5 (Tasks 5.1 → 5.2) — can start after Phase 3
              (5.1 swaps deepseek() for gateway strings in orchestrator)

Phase 6 — after Phases 3-5 stable
```

**Sequencing rationale:** Phase 3 must run before Phase 5 because `ToolLoopAgent` requires a `LanguageModel` object. Phase 3 uses `deepseek()` (typed provider). Phase 5 then swaps to gateway strings. Running Phase 5 first would break typing.

**Parallelization note:** Phases 4 and 5 are independent of each other and can run in parallel after Phase 3, but both modify `src/app/api/chat/route.ts` and `src/lib/agents/orchestrator.ts`. If using subagents, execute them sequentially or in separate worktrees.
