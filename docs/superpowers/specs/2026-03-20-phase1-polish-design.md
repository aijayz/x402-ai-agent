# Phase 1 Polish: Cost-Aware UX, Cluster Placeholders, Dark Mode

## Goal

Make the x402 AI Agent demo-ready: the AI autonomously manages the user's budget, the UI clearly communicates costs, cluster tools degrade gracefully when services aren't connected, and the visual design matches crypto-native expectations.

## Scope

Three workstreams executed together:

- **B: Error UX & credit balance** -- unified balance display, auto-downgrade cost logic, inline action buttons
- **C: Cluster tool placeholders** -- structured explanatory responses when x402 services aren't configured
- **UI: Dark mode & brand polish** -- dark default, gradient accents, Web3-style wallet connect

Out of scope: real deposit detection (A), production hardening (D), Alchemy webhook setup.

## Prerequisites

- Install shadcn Sheet component: `pnpm dlx shadcn@latest add sheet`

---

## B1: Cost-Aware Orchestrator

### Current behavior
The orchestrator's system prompt lists tool prices but doesn't know the user's balance. It may attempt expensive tools that fail at reservation time, wasting a round-trip.

### Design
The orchestrator already calls `budget.remainingUsdc()` in its instructions (line 50 of `orchestrator.ts`). Enhance this to also convey the user's mode and constraints:

- Add `isAnonymous: boolean` and `freeCallsRemaining?: number` to `CreateOrchestratorOptions`
- The chat route (`route.ts`) passes these when constructing the orchestrator:
  - Wallet user: `isAnonymous: false` (balance comes from `budget.remainingUsdc()` as today)
  - Anonymous user: `isAnonymous: true, freeCallsRemaining: SessionStore.MAX_FREE_CALLS - session.freeCallsUsed`

The instructions template becomes:

```
You are an autonomous x402 AI agent.
${isAnonymous
  ? `This is a free-tier user with ${freeCallsRemaining} calls remaining. Only use free tools or MCP tools under $0.05.`
  : `Your user has $${budget.remainingUsdc().toFixed(2)} in credits.`}

Rules:
- If a tool costs more than the user's balance, use a cheaper tier if available.
  If no tier is affordable, tell them the cost and that they need to top up.
  Include [ACTION:topup] so they can top up directly.
- Never ask the user "should I proceed?" for routine costs. You have spending authority.
- When telling the user to connect a wallet, include [ACTION:connect_wallet].
- If a cluster tool returns unavailable services, explain what the tool would do
  and its typical cost. Frame as "coming soon", don't apologize.
```

### Files
- Modify: `src/lib/agents/orchestrator.ts` -- add `isAnonymous` and `freeCallsRemaining` to options, use in instructions
- Modify: `src/app/api/chat/route.ts` -- pass `isAnonymous` and `freeCallsRemaining` to `createOrchestrator`

---

## B2: Unified Credit Balance Display

### Current behavior
Two separate balance indicators exist:
1. `creditBalance` in top-right wallet area (set once at connect, never updates)
2. `budgetRemaining` in toolbar (from message metadata, updates per turn)

For wallet users these show different numbers.

### Design
Single source of truth:

- **Wallet users**: balance shown in the wallet pill (header, right side). Updated from:
  - Message metadata (`budgetRemaining`) after every AI turn
  - New `GET /api/credits/balance?wallet=0x...` on wallet connect and page load (wallet-only endpoint)
- **Anonymous users**: show `"N free calls left"` in the wallet pill area. The count comes from message metadata (`freeCallsRemaining` field added to `messageMetadata` in the chat route).
- **Remove** the toolbar `budgetRemaining` indicator for all users
- **`SessionReceipt`**: keep it, but remove the `balanceRemaining` prop and its display row. The receipt's job is "what you spent this turn" (itemized list + total). The wallet pill shows the current balance. Update both the component interface AND the call site in `page.tsx` that passes `balanceRemaining`.

### Files
- Create: `src/app/api/credits/balance/route.ts` -- wallet-only GET endpoint: `{ balanceMicroUsdc: number }`
- Modify: `src/app/page.tsx` -- remove toolbar budget, update wallet pill from metadata + balance endpoint, remove `balanceRemaining` prop from `<SessionReceipt>` call site
- Modify: `src/components/ai-elements/session-receipt.tsx` -- remove `balanceRemaining` from props interface and JSX
- Modify: `src/app/api/chat/route.ts` -- add `freeCallsRemaining` to `messageMetadata` for anonymous users

---

## B3: Inline Action Buttons

### Current behavior
When the AI says "you need to top up" or "connect a wallet", the user must type a response or find a button elsewhere on the page.

### Design
The AI's response text can include action markers. These are parsed in `page.tsx` at the message rendering layer, NOT inside the `<Response>` component.

Implementation approach:
1. In `page.tsx` where `part.type === "text"` is rendered, check for `[ACTION:xxx]` markers
2. **Only parse actions on completed messages** (when `status !== "streaming"` or this is not the last message). During streaming, render the text as-is including the raw marker text -- it appears briefly and resolves on completion. This avoids partial-render artifacts.
3. For completed messages: split `part.text` on `[ACTION:xxx]` regex, render the cleaned text inside `<Response>`, render extracted actions as styled `<button>` elements immediately after `<Response>`
4. Do NOT modify `response.tsx` -- Streamdown wrapper stays untouched

Action markers only appear in top-level assistant text parts (not in tool outputs). The orchestrator instructions specify when to use them. Tool output renderers in `tool.tsx` never parse for actions.

Available actions:
- `[ACTION:topup]` -> "Top Up" button that opens the top-up sheet. **Requires wallet connection first** -- if wallet is not connected, the button calls `connectWallet()` then opens the sheet on success.
- `[ACTION:connect_wallet]` -> "Connect Wallet" button that calls `connectWallet()`

**Top-up sheet**: A simple `Sheet` (shadcn, must be installed as prerequisite) component showing:
- The treasury deposit address (fetched from `POST /api/credits/topup` using the connected wallet address -- wallet must be connected before opening)
- Network name (Base Sepolia / Base)
- "Send USDC to this address" instruction
- Copy button for the address

### Files
- Modify: `src/app/page.tsx` -- action marker parsing in completed message render, top-up sheet component, action button styling
- Modify: `src/lib/agents/orchestrator.ts` -- action marker instructions (covered in B1)
- Do NOT modify `src/components/ai-elements/response.tsx`

---

## B4: Remove Dead Code

- Delete `CostConfirmBanner` component and all related state (`pendingCostConfirm`, `checkForCostAnnouncement` function, the useEffect that calls it)
- Remove `PromptInputButton` import (imported at line 18 but never used in JSX)
- Remove `creditBalance` state (replaced by unified balance in wallet context)
- Remove toolbar `budgetRemaining` display

### Files
- Modify: `src/app/page.tsx`

---

## C1: Cluster Tool Placeholders

### Current behavior
When x402 service URLs aren't configured, cluster tools call nothing and return error strings like `"RugMunch: not configured"`. The AI then apologizes.

### Design
Add `unavailableServices` field to `ClusterResult`:

```typescript
interface UnavailableService {
  name: string;
  purpose: string;
  typicalCostUsdc: number;
}

// Add to existing ClusterResult:
unavailableServices?: UnavailableService[];
```

**Guard condition**: Each service call is already gated by `if (env.XXXXX_URL)`. The `else` branches currently push error strings like `"RugMunch: not configured"`. Change these `else` branches to push into an `unavailableServices` array instead. This is the single, consistent pattern across all four cluster files.

Example for cluster-a-defi:
```typescript
const unavailable: UnavailableService[] = [];
if (env.RUGMUNCH_URL) {
  // ... existing fetch logic
} else {
  unavailable.push({ name: "RugMunch", purpose: "Rug pull detection and honeypot scanning", typicalCostUsdc: 0.05 });
}
// ... same for Augur, DiamondClaws

return { summary, serviceCalls: calls, totalCostMicroUsdc: totalCost, unavailableServices: unavailable.length > 0 ? unavailable : undefined };
```

If ALL services in a cluster are unavailable, skip the credit reservation entirely (no cost, nothing to reserve).

All four currently-imported cluster tools are modified: `cluster-a-defi`, `cluster-b-whale`, `cluster-d-social`, `cluster-f-solana`. Future clusters should follow the same `if (env.URL) { fetch } else { unavailable.push(...) }` pattern.

### Files
- Modify: `src/lib/clusters/types.ts` -- add `UnavailableService` type and `unavailableServices` to `ClusterResult`
- Modify: `src/lib/clusters/cluster-a-defi.ts` -- replace error strings with structured unavailable entries
- Modify: `src/lib/clusters/cluster-b-whale.ts` -- same
- Modify: `src/lib/clusters/cluster-d-social.ts` -- same
- Modify: `src/lib/clusters/cluster-f-solana.ts` -- same

---

## UI1: Dark Mode Default

### Current behavior
`<html lang="en" className="h-full">` -- no dark class. Dark CSS variables exist in `globals.css` but aren't active. Hardcoded light-mode colors in error states (`bg-red-50`, `bg-yellow-50`, `text-red-900`).

### Design
- Add `className="dark"` to `<html>` element in `layout.tsx`
- Replace all hardcoded light-mode color classes with dark-appropriate equivalents:
  - Error state: `bg-red-50` -> `bg-red-950/50`, `border-red-200` -> `border-red-800/50`, `text-red-900` -> `text-red-200`, `text-red-700` -> `text-red-300`
  - Warning state: `bg-yellow-50` -> `bg-yellow-950/50`, `border-yellow-200` -> `border-yellow-800/50`, `text-yellow-900` -> `text-yellow-200`, `text-yellow-700` -> `text-yellow-300`
- Header: replace hardcoded `border-gray-200/60` with `border-border`. The header gradient already has `dark:` variants, so it will work once `dark` class is active.

### Files
- Modify: `src/app/layout.tsx` -- add `dark` class
- Modify: `src/app/page.tsx` -- fix hardcoded error/warning state colors

---

## UI2: Wallet Pill in Header

### Current behavior
Wallet connect is a plain `<button className="border">` inside `page.tsx`'s chat area. The header is a server component in `layout.tsx`.

### Design
Move wallet display into the header as a polished "wallet pill" component.

**Architecture**: Create a `<WalletProvider>` React context that owns wallet state (`walletAddress`, `balance`, `connectWallet`, `refreshBalance`). Wrap `{children}` in `layout.tsx` with this provider via a `<ClientProviders>` client component.

```
layout.tsx (server)
  -> <ClientProviders>        (client, provides WalletContext)
       -> <Header />          (client, reads WalletContext for pill)
       -> <main>{children}</main>
```

`page.tsx` consumes `useWallet()` context instead of owning wallet state directly. All `sendMessage` calls in `handleSubmit`, `handleRetry`, and `handleSuggestionClick` read `walletAddress` from `useWallet()` instead of local state. This eliminates state duplication and ensures the wallet header is always in sync.

**Wallet pill styling**:
- Disconnected: gradient-border pill (blue->cyan->amber) with wallet icon + "Connect Wallet" text
- Connected: solid dark pill with truncated address + balance (`0x12...5678 | $0.42`)
- Geist Mono for address and balance

### Files
- Create: `src/components/wallet-provider.tsx` -- WalletContext with `walletAddress`, `balance`, `connectWallet()`, `refreshBalance()`
- Create: `src/components/wallet-pill.tsx` -- styled wallet connect/display component
- Create: `src/components/client-providers.tsx` -- wraps children with WalletProvider
- Modify: `src/app/layout.tsx` -- wrap children in ClientProviders, render WalletPill in header
- Modify: `src/app/page.tsx` -- consume `useWallet()` instead of local wallet state, remove inline wallet UI, update all `sendMessage` calls to use `walletAddress` from context

---

## UI3: Paid Tool Visual Treatment

### Current behavior
The `tool.tsx` component distinguishes paid MCP tools with amber icons and a "Paid Tool" label via a hardcoded `PAID_TOOLS` list. Cluster tools aren't in this list. Cost isn't shown in the tool header.

### Design
- Expand `PAID_TOOLS` list to include cluster tool names: `analyze_defi_safety`, `track_whale_activity`, `analyze_social_narrative`, `analyze_solana_staking`
- Show cost in the tool header status badge **only when `state === "output-available"`** (cost is unknown during earlier states like `input-streaming` or `input-available`). Parse `part.output` for:
  - MCP tools: `part.output._meta["x402.payment-response"].amount` or `TOOL_PRICES[toolName]`
  - Cluster tools: parse `part.output` JSON text content for `totalCostMicroUsdc` field
  - If cost is 0 or unavailable, show no cost badge
- For cluster results with `unavailableServices` in the output, render a styled "Services Coming Soon" card in `ToolOutput`: list each service with name, purpose, and typical cost in a clean grid. No raw JSON dump.

### Files
- Modify: `src/components/ai-elements/tool.tsx` -- expand `PAID_TOOLS`, cost badge in header (output-available only), cluster placeholder renderer in ToolOutput

---

## Testing

Tests live in `src/lib/__tests__/` using vitest (existing convention).

### Balance endpoint test: `src/lib/__tests__/balance-endpoint.test.ts`
- Happy path: returns `{ balanceMicroUsdc }` for a known wallet
- Missing `wallet` query param: returns 400
- Non-existent wallet: returns 404 or `{ balanceMicroUsdc: 0 }`

### Manual verification checklist
- Dark mode renders correctly across all states (empty, messages, error, wallet connected/disconnected)
- Wallet pill in header: connects, shows balance, updates after tool calls
- Cluster tools show structured "coming soon" placeholders when no service URLs configured
- Orchestrator respects balance: auto-downgrades or suggests top-up when credits are low
- Action buttons render in completed messages and work (top-up sheet opens, connect wallet triggers)
- `[ACTION:xxx]` markers visible as raw text during streaming, resolved to buttons on completion
- SessionReceipt shows itemized costs without redundant balance line
- Top-up sheet shows deposit address and copy button
