# Credit Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard error walls with inline banners and auto-retry for credit transitions.

**Architecture:** New `CreditStatusBanner` component sits between conversation and prompt input. It reads wallet context + error state to show progressive nudges. Auto-retry stores failed message text in a ref and resends after wallet connect or top-up completes.

**Tech Stack:** React, Tailwind CSS, existing wallet context + useChat hooks.

**Spec:** `docs/superpowers/specs/2026-03-23-credit-onboarding-design.md`

---

### Task 1: Create CreditStatusBanner Component

**Files:**
- Create: `src/components/credit-status-banner.tsx`

- [ ] **Step 1: Create the banner component**

```tsx
// src/components/credit-status-banner.tsx
"use client";

import { Wallet, Coins, Loader2, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerState =
  | "hidden"
  | "low-anon"
  | "low-wallet"
  | "exhausted-anon"
  | "exhausted-wallet"
  | "retrying";

interface CreditStatusBannerProps {
  state: BannerState;
  onConnectWallet: () => void;
  onTopUp: () => void;
  onDismiss?: () => void;
}

export function CreditStatusBanner({ state, onConnectWallet, onTopUp, onDismiss }: CreditStatusBannerProps) {
  if (state === "hidden") return null;

  const config = {
    "low-anon": {
      icon: Wallet,
      text: "1 free call remaining",
      cta: "Connect wallet for more",
      onCta: onConnectWallet,
      style: "border-blue-500/30 bg-blue-500/[0.06]",
      iconStyle: "text-blue-400",
      ctaStyle: "text-blue-400 hover:text-blue-300",
      dismissible: true,
    },
    "low-wallet": {
      icon: Coins,
      text: "Balance running low",
      cta: "Top up",
      onCta: onTopUp,
      style: "border-amber-500/30 bg-amber-500/[0.06]",
      iconStyle: "text-amber-400",
      ctaStyle: "text-amber-400 hover:text-amber-300",
      dismissible: true,
    },
    "exhausted-anon": {
      icon: Wallet,
      text: "Free calls used up",
      cta: null, // button instead
      onCta: onConnectWallet,
      style: "border-blue-500/40 bg-gradient-to-r from-blue-500/10 to-cyan-500/[0.06]",
      iconStyle: "text-blue-400",
      ctaStyle: "",
      dismissible: false,
    },
    "exhausted-wallet": {
      icon: Coins,
      text: "Credits depleted",
      cta: null, // button instead
      onCta: onTopUp,
      style: "border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/[0.06]",
      iconStyle: "text-amber-400",
      ctaStyle: "",
      dismissible: false,
    },
    "retrying": {
      icon: Loader2,
      text: "Resending your message...",
      cta: null,
      onCta: () => {},
      style: "border-green-500/30 bg-green-500/[0.06]",
      iconStyle: "text-green-400 animate-spin",
      ctaStyle: "",
      dismissible: false,
    },
  } as const;

  const c = config[state];
  const Icon = c.icon;

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm animate-in fade-in slide-in-from-bottom-1 duration-200",
      c.style
    )}>
      <Icon className={cn("size-4 shrink-0", c.iconStyle)} />
      <span className="text-foreground/90 text-xs sm:text-sm truncate">{c.text}</span>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {c.cta ? (
          <button
            onClick={c.onCta}
            className={cn("text-xs sm:text-sm font-medium transition-colors whitespace-nowrap", c.ctaStyle)}
          >
            {c.cta}
          </button>
        ) : state === "exhausted-anon" ? (
          <button
            onClick={onConnectWallet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium
              bg-blue-500/20 border border-blue-500/40 hover:border-blue-400/60
              text-blue-200 hover:text-blue-100 transition-all whitespace-nowrap min-h-[36px]"
          >
            <Wallet className="size-3.5" />
            Connect Wallet
          </button>
        ) : state === "exhausted-wallet" ? (
          <button
            onClick={onTopUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium
              bg-amber-500/20 border border-amber-500/40 hover:border-amber-400/60
              text-amber-200 hover:text-amber-100 transition-all whitespace-nowrap min-h-[36px]"
          >
            <ArrowUpRight className="size-3.5" />
            Top Up
          </button>
        ) : null}
        {c.dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No errors related to `credit-status-banner.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/credit-status-banner.tsx
git commit -m "feat: add CreditStatusBanner component"
```

---

### Task 2: Add onTopUpComplete to Wallet Context + TopUpSheet

TopUpSheet is rendered in `src/app/chat/layout.tsx` (not page.tsx), so we wire the callback through wallet context.

**Files:**
- Modify: `src/components/wallet-provider.tsx`
- Modify: `src/components/topup-sheet.tsx`

- [ ] **Step 1: Add onTopUpComplete ref to WalletContext**

In `wallet-provider.tsx`, add `useRef` to imports:
```tsx
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
```

Add to the context interface:
```tsx
onTopUpCompleteRef: React.RefObject<(() => void) | null>;
```

In `WalletProvider`, add a ref:
```tsx
const onTopUpCompleteRef = useRef<(() => void) | null>(null);
```

Add it to the Provider value.

- [ ] **Step 2: Call the ref in TopUpSheet on success**

In `topup-sheet.tsx`, get the ref from wallet context:
```tsx
const { ..., onTopUpCompleteRef } = useWallet();
```

In the success branch (after `setTopUpStatus("done")` and `await refreshBalance()`), call it:
```tsx
if (res.ok) {
  setTopUpStatus("done");
  await refreshBalance();
  onTopUpCompleteRef.current?.();
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/wallet-provider.tsx src/components/topup-sheet.tsx
git commit -m "feat: add onTopUpComplete callback via wallet context"
```

---

### Task 3: Wire Banner + Auto-Retry into Chat Page

**Files:**
- Modify: `src/app/chat/page.tsx`

This is the main integration task. Changes:

- [ ] **Step 1: Add imports and refs**

Add to imports at top of file:
```tsx
import { CreditStatusBanner, type BannerState } from "@/components/credit-status-banner";
```

Add inside `ChatPage` component, after existing refs:
```tsx
const pendingRetryRef = useRef<string | null>(null);
const [bannerDismissed, setBannerDismissed] = useState(false);
```

- [ ] **Step 2: Compute banner state**

Add a `useMemo` to derive banner state from existing signals. Place after the `useEffect` that updates wallet context from metadata (around line 151):

```tsx
// Reset banner dismissed on new conversation turn (not on every metadata update)
useEffect(() => {
  if (status === "ready") setBannerDismissed(false);
}, [status]);
// Also reset on wallet connect
useEffect(() => {
  setBannerDismissed(false);
}, [walletAddress]);

const bannerState: BannerState = useMemo(() => {
  // Retrying takes priority — check ref existence (not just status) to avoid flash
  if (pendingRetryRef.current) return "retrying";
  if (lastError?.message?.includes("FREE_CALLS_EXHAUSTED") || lastError?.message?.includes("Free calls exhausted")) {
    return walletAddress ? "exhausted-wallet" : "exhausted-anon";
  }
  if (bannerDismissed) return "hidden";
  if (!walletAddress && freeCallsRemaining === 1) return "low-anon";
  if (walletAddress && balance !== null && balance <= 0) return "exhausted-wallet";
  if (walletAddress && balance !== null && balance < 50000 && balance > 0) return "low-wallet";
  return "hidden";
}, [lastError, walletAddress, freeCallsRemaining, balance, bannerDismissed]);
```

Note: `freeCallsRemaining` and `balance` come from `useWallet()` — add them to the destructured values:
```tsx
const { walletAddress, balance, freeCallsRemaining, connectWallet, setTopUpOpen, updateFromMetadata } = useWallet();
```

- [ ] **Step 3: Add retryPendingMessage helper**

Add after `handleRetry`:

```tsx
const retryPendingMessage = useCallback((overrideAddress?: string) => {
  const text = pendingRetryRef.current;
  if (!text) return;

  // Remove the failed user message
  const lastUserMessage = messages.filter(m => m.role === "user").pop();
  if (lastUserMessage) {
    setMessages(prev => prev.filter(m => m.id !== lastUserMessage.id));
  }
  setLastError(null);

  const addr = overrideAddress || walletAddress;
  const h = addr ? { "x-wallet-address": addr } : undefined;
  sendMessage({ text }, { headers: h });
  // pendingRetryRef.current stays set — cleared when streaming starts
}, [messages, setMessages, sendMessage, walletAddress]);
```

- [ ] **Step 4: Store pending message on FREE_CALLS_EXHAUSTED error**

Modify the `onError` callback in `useChat`:
```tsx
onError: (error) => {
  if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
    setLastError(new Error("RATE_LIMITED"));
  } else {
    // Store pending message for auto-retry on credit errors
    if (error.message?.includes("FREE_CALLS_EXHAUSTED") || error.message?.includes("Free calls exhausted")) {
      const lastUserMsg = messages.filter(m => m.role === "user").pop();
      const text = lastUserMsg?.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("") || "";
      if (text) pendingRetryRef.current = text;
    }
    setLastError(error);
  }
},
```

- [ ] **Step 5: Clear pendingRetryRef when streaming starts**

Add an effect to clear the ref when streaming begins:
```tsx
useEffect(() => {
  if (status === "streaming" && pendingRetryRef.current) {
    pendingRetryRef.current = null;
  }
}, [status]);
```

- [ ] **Step 6: Update handleConnectAndRetry to use retryPendingMessage**

Replace the existing `handleConnectAndRetry`:
```tsx
const handleConnectAndRetry = useCallback(async () => {
  const address = await connectWallet();
  if (!address) return;
  retryPendingMessage(address);
}, [connectWallet, retryPendingMessage]);
```

- [ ] **Step 7: Delete the FREE_CALLS_EXHAUSTED error card**

Remove the entire block from the conversation area (the `lastError?.message?.includes("FREE_CALLS_EXHAUSTED")` conditional and its JSX). Keep the generic error card but guard it:

```tsx
{status === "error" && lastError?.message !== "RATE_LIMITED" && !lastError?.message?.includes("FREE_CALLS_EXHAUSTED") && (
  <div className="flex flex-col items-center ...">
    {/* existing generic error card */}
  </div>
)}
```

- [ ] **Step 8: Add the banner and conditionally hide Loader**

Between `</Conversation>` and `<PromptInput>`, add the banner:
```tsx
<CreditStatusBanner
  state={bannerState}
  onConnectWallet={handleConnectAndRetry}
  onTopUp={() => setTopUpOpen(true)}
  onDismiss={() => setBannerDismissed(true)}
/>
```

Update the Loader to hide when retrying (banner shows instead):
```tsx
{status === "submitted" && !pendingRetryRef.current && <Loader />}
```

- [ ] **Step 9: Wire onTopUpCompleteRef to retryPendingMessage**

In ChatPage, get the ref from wallet context and set it:
```tsx
const { ..., onTopUpCompleteRef } = useWallet();

useEffect(() => {
  onTopUpCompleteRef.current = () => retryPendingMessage();
  return () => { onTopUpCompleteRef.current = null; };
}, [retryPendingMessage, onTopUpCompleteRef]);
```

This way when TopUpSheet succeeds, it calls the ref which triggers retry in ChatPage.

- [ ] **Step 10: Typecheck and verify**

Run: `pnpm typecheck`
Expected: PASS

Start dev server: `pnpm dev`
Manual verification:
1. Open chat as anonymous user, send 1 message — should see "1 free call remaining" nudge
2. Send 2nd message — nudge should disappear (no calls left to warn about, it's the last one)
3. Attempt 3rd message — banner shows "Free calls used up" with Connect Wallet button
4. Connect wallet — should auto-retry the message
5. With wallet connected and low balance — should see "Balance running low" nudge
6. Check mobile viewport — banner should be compact, CTA visible

- [ ] **Step 11: Commit**

```bash
git add src/app/chat/page.tsx
git commit -m "feat: wire credit status banner and auto-retry into chat"
```

---

### Task 4: Final Typecheck and Manual Verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Manual verification with dev server**

Run: `pnpm dev`

Test cases:
1. Anonymous: send 1 message, verify "1 free call remaining" nudge appears above input
2. Anonymous: send 2nd message, nudge gone (last call already used)
3. Anonymous: attempt 3rd message, banner shows "Free calls used up" + Connect Wallet button
4. Click Connect Wallet, verify auto-retry resends the message
5. With wallet + low balance: verify "Balance running low" nudge
6. Dismiss nudge with X, verify it hides
7. Mobile viewport (375px): verify banner is compact, CTA visible, touch targets >= 44px

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: credit onboarding adjustments from manual testing"
```
