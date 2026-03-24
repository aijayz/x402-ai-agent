# Multi-Chain EVM Deposits — Design Spec

## Goal

Add deposit support for Ethereum, Arbitrum, and Optimism alongside existing Base. Users select their source chain in the top-up sheet, MetaMask switches chains, and the existing signing flow works. Alchemy webhooks detect deposits on each chain and credit the user's balance instantly. Funds are swept to Base periodically via CDP.

## Scope

**In scope (Phase 2.a):**
- 4 EVM chains: Base (existing), Ethereum, Arbitrum, Optimism
- Chain picker UI in top-up sheet
- MetaMask chain switching
- Alchemy webhooks per chain for deposit detection
- Confirm endpoint extended to support all chains (not webhook-only)
- Instant crediting on deposit (no waiting for sweep)
- Multi-chain sweep script via CDP `sendTransaction`
- Operational documentation in `docs/ops/`

**Out of scope (Phase 2.b):**
- Solana support (requires multi-chain identity redesign)
- Wallet linking (EVM <-> Solana)
- Automated CCTP bridging (manual sweep is sufficient for v1)
- Additional EVM chains (Polygon, Avalanche, BSC — can be added later by adding a config entry)

## Architecture

### Chain Configuration

A single `ChainConfig` type defines everything per chain. New file: `src/lib/chains.ts`.

```typescript
type ChainConfig = {
  name: string;                // "Ethereum"
  network: string;             // CDP network name: "ethereum"
  chainId: number;             // 1
  usdcAddress: `0x${string}`;  // USDC contract on that chain
  depositAddress: string;      // same CDP purchaser address for all EVM
  explorerBaseUrl: string;     // "https://etherscan.io"
  alchemyNetwork: string;      // Alchemy webhook network identifier
};
```

All 4 chains share the same deposit address — the CDP purchaser wallet (`0x58F3...`). The same private key (managed by CDP) controls this address on all EVM chains.

**CDP multi-chain support verified:** The CDP SDK v1.36.0 `networkCapabilities.ts` explicitly lists `sendTransaction: true` for `ethereum`, `arbitrum`, and `optimism`. The comment in the source says "Always available (uses wallet client for non-base networks)." This means sweeping is possible via CDP without self-custodial keys.

Adding a future chain (e.g., Polygon) requires only adding an entry to the config + an Alchemy webhook.

### Webhook Architecture

One webhook endpoint per chain, all sharing a common handler function.

**Routes:**
```
/api/credits/webhook/base       (existing, refactored)
/api/credits/webhook/ethereum   (new)
/api/credits/webhook/arbitrum   (new)
/api/credits/webhook/optimism   (new)
```

**Shared handler:** `src/lib/credits/deposit-handler.ts`

The handler:
1. Verifies Alchemy HMAC signature (per-chain signing key from env)
2. Parses ERC-20 Transfer events from the webhook payload
3. Checks it's USDC sent **to** our deposit address on that chain (must verify `toAddress` matches purchaser — the existing Base webhook is missing this check and must be fixed)
4. Looks up credit account by sender wallet address
5. Credits balance atomically (same pattern as current confirm route — idempotency via `(tx_hash, source_chain)` composite key)
6. Records a spend event with `tool_name: "topup"` and `source_chain` column
7. Sends Telegram alert

**Alchemy setup:** One "Address Activity" webhook per chain, watching the purchaser address for USDC transfers. Each webhook gets its own signing key.

**Env vars:**
- `ALCHEMY_WEBHOOK_KEY_BASE` (new — replaces `ALCHEMY_WEBHOOK_SIGNING_KEY`)
- `ALCHEMY_WEBHOOK_KEY_ETHEREUM`
- `ALCHEMY_WEBHOOK_KEY_ARBITRUM`
- `ALCHEMY_WEBHOOK_KEY_OPTIMISM`

**Migration note:** `ALCHEMY_WEBHOOK_SIGNING_KEY` must be kept as a fallback alias in `env.ts` during the transition period. The Base webhook route reads the new key first, falls back to the old key. This avoids a breaking change during deploy.

### Database Changes

**1. Add `source_chain` column:**

```sql
ALTER TABLE spend_events ADD COLUMN source_chain TEXT NOT NULL DEFAULT 'base';
```

Existing rows default to `'base'`. The existing confirm route (`topup/confirm/route.ts`) explicitly inserts `source_chain = 'base'` in its raw SQL INSERT.

**2. Change tx_hash uniqueness to composite key:**

Transaction hashes are chain-scoped — the same hash could theoretically exist on two different chains. The idempotency constraint must be scoped:

```sql
-- Drop existing unique index on tx_hash (if any)
-- Add composite unique constraint
ALTER TABLE spend_events ADD CONSTRAINT spend_events_tx_chain_unique UNIQUE (tx_hash, source_chain);
```

**3. Update `SpendEventStore` interface:**

`SpendEventStore.record()` gains an optional `sourceChain` parameter defaulting to `'base'`. `SpendEventStore.existsByTxHash()` becomes `existsByTxHashAndChain(txHash, sourceChain)`.

### Confirm Endpoint (Extended)

The existing `/api/credits/topup/confirm` route is extended to support any EVM chain, not just Base. This provides a synchronous fallback if the Alchemy webhook misses a delivery.

Changes:
- Accept optional `sourceChain` parameter in request body (defaults to `'base'`)
- Resolve the correct chain's RPC URL and USDC address from `ChainConfig`
- Create a viem `PublicClient` for the selected chain
- Verify the transaction receipt on that chain
- Insert `source_chain` in the spend event

This means the top-up UI can use the confirm endpoint for all chains (same UX as Base), with webhooks as a safety net for manual deposits.

### Top-Up UI Changes

The existing `TopUpSheet` component gets a chain picker step inserted before amount selection.

**Flow:**
1. **Chain picker** — Row of chain buttons (Base, Ethereum, Arbitrum, Optimism) with chain icons. Base is pre-selected. **On testnet (`NEXT_PUBLIC_NETWORK === 'base-sepolia'`), the chain picker is hidden and only Base is available.**
2. **Chain switching** — When user picks a different chain, call `wallet_switchEthereumChain` (or `wallet_addEthereumChain` if not configured in MetaMask). Show error if switch fails.
3. **Amount + sign** — Same as today. `sendUsdc` uses the selected chain's USDC contract address from `ChainConfig`.
4. **Confirmation** — Same flow for all chains: call `/api/credits/topup/confirm` with `sourceChain` parameter. The confirm route handles on-chain verification for any supported chain.
5. **Manual fallback** — The "Or send manually to:" section displays the selected chain name and the correct USDC contract address alongside the deposit address, so manual senders know exactly which chain and token to use.

**Polling fallback for manual deposits:** If a user sends manually (without using the in-app signing flow), the Alchemy webhook credits their balance. The balance pill in the header updates on next refresh. No polling needed in this path — it's a background safety net.

### Wallet Provider Changes

`src/components/wallet-provider.tsx`:
- `sendUsdc` accepts an optional `usdcAddress` parameter (defaults to Base USDC). The function constructs the ERC-20 transfer using the provided address.
- New `switchChain(chainId: number)` helper that calls `wallet_switchEthereumChain` / `wallet_addEthereumChain`.
- No changes to wallet identity or auth. The connected wallet address remains the user's account ID.

### Top-Up API Change

`/api/credits/topup` response includes chain-specific info:

```json
{
  "depositAddress": "0x58F3...",
  "chains": {
    "base": { "chainId": 8453, "usdcAddress": "0x833589..." },
    "ethereum": { "chainId": 1, "usdcAddress": "0xA0b86..." },
    "arbitrum": { "chainId": 42161, "usdcAddress": "0xaf88d..." },
    "optimism": { "chainId": 10, "usdcAddress": "0x0b2C6..." }
  }
}
```

### Sweep / Consolidation

New script: `scripts/sweep-multichain.ts`

1. For each non-Base chain, checks USDC balance at the purchaser address via RPC
2. If balance exceeds a threshold (e.g., $50), triggers a CDP `sendTransaction` to transfer USDC to a bridge or centralized exchange for consolidation to Base
3. Logs each sweep action to Telegram
4. Supports `--dry-run` flag to preview balances without sweeping
5. Supports `--chain` flag to sweep a specific chain only

**CDP sweep support:** Uses `cdpClient.evm.getOrCreateAccount({ name: "Purchaser" })` scoped to the target network (e.g., `{ network: "ethereum" }`). The CDP SDK returns the same address but enables signing on that chain.

**Frequency:** Manual for v1 (run when needed). Can be promoted to a cron job later.

**Note:** The "bridge" step is manual — the script sends USDC to a bridge or exchange. Automated CCTP can be added as a future optimization.

### Documentation Structure

New `docs/ops/` directory for operational runbooks:

- `docs/ops/sweep.md` — Wallet sweep instructions for both single-chain (`scripts/sweep.ts`) and multi-chain (`scripts/sweep-multichain.ts`). Includes threshold guidance and dry-run examples.
- `docs/ops/webhooks.md` — Alchemy webhook setup per chain: how to create webhooks, signing keys, testing.
- `docs/ops/multi-chain.md` — Chain config reference, deposit addresses, USDC contract addresses, env var setup.

`CLAUDE.md` gets a one-line reference: `See docs/ops/ for operational runbooks.`

`README.md` gets a "Supported Chains" section listing the 4 chains with deposit info.

## What Does NOT Change

- **Auth / identity** — EVM wallet is the account identity. No Solana, no multi-wallet.
- **Credit system core** — `credit_accounts` table, balance logic, markup unchanged.
- **Chat API** — No changes to `/api/chat` or MCP tools.
- **Research clusters** — No changes.
- **Landing page** — No changes (could mention multi-chain in marketing copy later).

## File Summary

| Area | Files | Change |
|------|-------|--------|
| Chain config | `src/lib/chains.ts` (new) | `ChainConfig` type + configs for 4 chains |
| Shared webhook handler | `src/lib/credits/deposit-handler.ts` (new) | Common deposit webhook logic with `toAddress` check |
| Webhook routes | `src/app/api/credits/webhook/[chain]/route.ts` (new) | Per-chain thin routes |
| Existing webhook | `src/app/api/credits/webhook/route.ts` | Refactor to use shared handler |
| Confirm endpoint | `src/app/api/credits/topup/confirm/route.ts` | Accept `sourceChain`, multi-chain RPC verification |
| Top-up API | `src/app/api/credits/topup/route.ts` | Return chain-specific deposit info |
| Top-up UI | `src/components/topup-sheet.tsx` | Chain picker, chain switching, manual fallback with chain context |
| Wallet provider | `src/components/wallet-provider.tsx` | `switchChain()`, USDC address param |
| Database | SQL migration | Add `source_chain` column + composite unique `(tx_hash, source_chain)` |
| Spend store | `src/lib/credits/spend-store.ts` | `sourceChain` param, `existsByTxHashAndChain()` |
| Env vars | `src/lib/env.ts` | Per-chain Alchemy webhook keys + old key as fallback alias |
| Sweep script | `scripts/sweep-multichain.ts` (new) | Multi-chain USDC consolidation via CDP |
| Docs | `docs/ops/sweep.md` (new) | Sweep runbook |
| Docs | `docs/ops/webhooks.md` (new) | Alchemy webhook setup |
| Docs | `docs/ops/multi-chain.md` (new) | Chain config reference |
| Docs | `CLAUDE.md` | Reference to `docs/ops/` |
| Docs | `README.md` | Supported chains section |

## Future: Phase 2.b (Solana + Identity)

When we add Solana, the key changes are:

- **Identity:** `wallet-auth.ts` supports both address formats via prefix (`evm:0xABC` or `sol:Sol123`)
- **Sybil guard:** Solana equivalent of wallet-age check (Solana Explorer API or Helius)
- **Wallet provider:** Add `@solana/wallet-adapter-react` alongside wagmi
- **Wallet linking:** `wallet_links` table with signature-based proof of ownership on both wallets. Challenge message signed by both EVM (`personal_sign`) and Solana (`signMessage`) wallets, verified server-side.
- **Webhook:** Add `/api/credits/webhook/solana` using same shared handler pattern
- **Chain config:** Add Solana entry to `ChainConfig` (different address format, SPL token transfer)

The `ChainConfig` abstraction from Phase 2.a is designed to accommodate this — Solana just adds a new entry with chain-specific behavior.
