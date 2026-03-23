# Smarter Credit Onboarding

## Problem

The credit onboarding flow uses hard error walls that interrupt the conversation. Three failure points exist:

1. **Anonymous free calls exhausted**: API returns 402 `FREE_CALLS_EXHAUSTED`. UI shows a blocking card in the conversation area. User must connect wallet, claim credits, then manually retry.
2. **Wallet credits depleted**: No specific error — the AI agent can't use paid tools but there's no clear guidance to top up. Generic error card appears for actual failures.
3. **No progressive warnings**: `freeCallsRemaining` and `balance` are tracked in metadata but never surfaced to users before they hit a wall.

## Solution: Inline Banners + Auto-Retry

Replace error walls with a `<CreditStatusBanner>` component between the conversation area and the prompt input. Progressive nudges warn users before exhaustion. Auto-retry resends the failed message after the user completes the required action.

## Design

### CreditStatusBanner Component

A slim, single-line banner above the prompt input. States in priority order:

| State | Trigger | Detection Signal | Visual | Content | CTA |
|-------|---------|-----------------|--------|---------|-----|
| Exhausted (anon) | `FREE_CALLS_EXHAUSTED` error caught | `onError` callback: `error.message.includes("FREE_CALLS_EXHAUSTED")` | Blue bg, Wallet icon | "Free calls used up" | "Connect Wallet" button |
| Exhausted (wallet) | Balance depleted | `WalletContext.balance <= 0` (from metadata `budgetRemaining` after tool calls) | Amber bg, Coins icon | "Credits depleted" | "Top Up" button |
| Low (anon) | 1 free call left | `WalletContext.freeCallsRemaining === 1` (from metadata after first call) | Subtle blue border | "1 free call left" | "Connect wallet for more" text link |
| Low (wallet) | Balance running low | `WalletContext.balance < 50000` micro-USDC ($0.05) | Subtle amber border | "Balance low" | "Top up" text link |
| Retrying | After connect/topup with pending message | `pendingRetryRef.current !== null && status === "submitted"` | Green pulse | "Resending your message..." | Spinner |
| Hidden | Default | None of the above | — | — | — |

**Detection notes:**
- Anonymous exhaustion is detected via `onError` string matching (API returns 402 with `FREE_CALLS_EXHAUSTED` in body).
- Wallet exhaustion is detected via `WalletContext.balance` which updates from `budgetRemaining` in message metadata after each tool call. No server-side error code needed — the AI agent handles this by telling the user to top up, and the banner reinforces it.
- The "Retrying" banner replaces the `<Loader />` component: when `pendingRetryRef.current` is set and `status === "submitted"`, show the banner instead of the Loader.
- The "Retrying" state clears when `status` transitions to `"streaming"` (first token received) — set `pendingRetryRef.current = null` at that point.

**Mobile:** The banner is full-width, single line. On very narrow screens the descriptive text truncates but the CTA button/link stays visible. Touch targets are at least 44px.

### Error Wall Removal

- **Delete** the `FREE_CALLS_EXHAUSTED` blocking card from the conversation area
- **Keep** the `RATE_LIMITED` error card (different concern, stays in conversation)
- **Keep** the generic error card for real errors (network, model) but add a guard: skip it when `lastError?.message?.includes("FREE_CALLS_EXHAUSTED")` — those are handled by the banner instead

### Auto-Retry Flow

1. When `FREE_CALLS_EXHAUSTED` error fires in `onError`, extract the last user message text and store it in `pendingRetryRef` (a `useRef<string | null>(null)`)
2. Set `lastError` so the banner shows "exhausted" state with CTA
3. User clicks "Connect Wallet" or "Top Up":
   - **Connect**: `connectWallet()` runs, claims credits, returns address. On success, call `retryPendingMessage(address)` which reads `pendingRetryRef.current`, calls `sendMessage` with wallet headers, and sets `pendingRetryRef.current = null` once `status` transitions to `"streaming"`
   - **Top Up**: opens `TopUpSheet`. `TopUpSheet` accepts a new `onComplete?: () => void` prop, called inside the `topUpStatus === "done"` branch (after `refreshBalance()`). `ChatPage` passes `() => retryPendingMessage()` as `onComplete`
4. `retryPendingMessage` removes the failed user message, clears `lastError`, and resends via `sendMessage`
5. Banner shows "Retrying..." while `pendingRetryRef.current` is set and `status === "submitted"`. Clears when streaming begins.

### Pre-emptive Nudge Logic

- **Anonymous**: Show "1 free call left" when `freeCallsRemaining === 1` (value comes from message metadata after first call)
- **Wallet**: Show "Balance low" when `balance < 50000` ($0.05 micro-USDC). This threshold covers ~1-2 cheap tool calls.
- Nudges are **dismissible** (X button) but reappear if the condition is still true after the next message exchange

### API Changes

None. The chat API already returns `freeCallsRemaining` in message metadata, and `budgetRemaining` for wallet users. Wallet credit depletion is detected client-side via `WalletContext.balance` (updated from metadata after each tool call). No new server error codes needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/credit-status-banner.tsx` | **New** — banner component with all states, accepts `onConnectWallet`, `onTopUp` callbacks |
| `src/app/chat/page.tsx` | Remove FREE_CALLS_EXHAUSTED error card, add banner between conversation and input, wire `pendingRetryRef` and `retryPendingMessage`, pass callbacks to banner, guard generic error card against credit errors, hide `<Loader />` when retrying |
| `src/components/topup-sheet.tsx` | Add `onComplete?: () => void` prop, call it in `topUpStatus === "done"` branch after `refreshBalance()` |

## Out of Scope

- Changing the credit amounts or Sybil guard logic
- Multi-step onboarding wizard / modal funnel
- Changing how the AI agent handles budget awareness in its system prompt
