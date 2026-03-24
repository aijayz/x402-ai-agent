# Multi-Chain EVM Deposits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deposit support for Ethereum, Arbitrum, and Optimism alongside existing Base, with chain picker UI, Alchemy webhooks, and multi-chain sweep.

**Architecture:** Chain config defines per-chain metadata (USDC address, chainId, explorer). All chains share the same CDP deposit address. Alchemy webhooks detect deposits per chain; the confirm endpoint is extended to verify on any chain. A sweep script consolidates funds to Base via CDP.

**Tech Stack:** Next.js App Router, viem, CDP SDK, Alchemy webhooks, Neon Postgres, Tailwind CSS

---

### Task 1: Chain Configuration Module

**Files:**
- Create: `src/lib/chains.ts`

This is the foundation — every other task imports from here.

- [ ] **Step 1: Create `src/lib/chains.ts` with ChainConfig type and all 4 chain configs**

```typescript
import { base, baseSepolia, mainnet, arbitrum, optimism } from "viem/chains";
import type { Chain } from "viem";

export type ChainKey = "base" | "ethereum" | "arbitrum" | "optimism";

export interface ChainConfig {
  name: string;
  key: ChainKey;
  network: string;               // CDP network name
  chainId: number;
  viemChain: Chain;
  usdcAddress: `0x${string}`;
  depositAddress: string;         // same CDP purchaser for all EVM
  explorerBaseUrl: string;
  rpcUrl: string;
}

// Purchaser wallet address (CDP-managed, same key on all EVM chains)
const DEPOSIT_ADDRESS = "0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e";

export const SUPPORTED_CHAINS: Record<ChainKey, ChainConfig> = {
  base: {
    name: "Base",
    key: "base",
    network: "base",
    chainId: 8453,
    viemChain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
  },
  ethereum: {
    name: "Ethereum",
    key: "ethereum",
    network: "ethereum",
    chainId: 1,
    viemChain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://etherscan.io",
    rpcUrl: "https://eth.llamarpc.com",
  },
  arbitrum: {
    name: "Arbitrum",
    key: "arbitrum",
    network: "arbitrum",
    chainId: 42161,
    viemChain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://arbiscan.io",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    name: "Optimism",
    key: "optimism",
    network: "optimism",
    chainId: 10,
    viemChain: optimism,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://optimistic.etherscan.io",
    rpcUrl: "https://mainnet.optimism.io",
  },
};

// Testnet config (only Base Sepolia)
export const TESTNET_CHAINS: Record<string, ChainConfig> = {
  base: {
    name: "Base Sepolia",
    key: "base",
    network: "base-sepolia",
    chainId: 84532,
    viemChain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://sepolia.basescan.org",
    rpcUrl: "https://sepolia.base.org",
  },
};

/** Get chain configs for current network. Testnet = Base only. Mainnet = all 4. */
export function getChainConfigs(network: "base" | "base-sepolia"): Record<string, ChainConfig> {
  return network === "base" ? SUPPORTED_CHAINS : TESTNET_CHAINS;
}

/** Look up a chain config by key, with network awareness. */
export function getChainConfig(chainKey: string, network: "base" | "base-sepolia"): ChainConfig | undefined {
  return getChainConfigs(network)[chainKey];
}

/** All chain keys for current network. */
export function getChainKeys(network: "base" | "base-sepolia"): string[] {
  return Object.keys(getChainConfigs(network));
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/chains.ts
git commit -m "feat: add multi-chain config module with Base, Ethereum, Arbitrum, Optimism"
```

---

### Task 2: Database Migration + SpendEventStore Update

**Files:**
- Modify: `src/lib/db-schema.sql`
- Modify: `src/lib/credits/spend-store.ts`

- [ ] **Step 1: Update `src/lib/db-schema.sql` — add `source_chain` column and composite unique constraint**

Replace the entire `spend_events` CREATE TABLE block (lines 24-33 of `src/lib/db-schema.sql`) with:

```sql
CREATE TABLE IF NOT EXISTS spend_events (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES credit_accounts(wallet_address),
  tool_name TEXT NOT NULL,
  service_cost_micro_usdc BIGINT NOT NULL,
  charged_amount_micro_usdc BIGINT NOT NULL,
  markup_bps INTEGER NOT NULL,
  tx_hash TEXT,
  source_chain TEXT NOT NULL DEFAULT 'base',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT spend_events_tx_chain_unique UNIQUE (tx_hash, source_chain)
);
```

Also add a migration comment block right before the CREATE TABLE:

```sql
-- Migration: multi-chain deposits (run against existing databases)
-- ALTER TABLE spend_events ADD COLUMN IF NOT EXISTS source_chain TEXT NOT NULL DEFAULT 'base';
-- ALTER TABLE spend_events ADD CONSTRAINT spend_events_tx_chain_unique UNIQUE (tx_hash, source_chain);
```

- [ ] **Step 2: Run the migration against staging and production databases**

```sql
ALTER TABLE spend_events ADD COLUMN IF NOT EXISTS source_chain TEXT NOT NULL DEFAULT 'base';
ALTER TABLE spend_events ADD CONSTRAINT spend_events_tx_chain_unique UNIQUE (tx_hash, source_chain);
```

Note: If there's an existing unique index on `tx_hash` alone, drop it first. Check with:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'spend_events' AND indexdef LIKE '%tx_hash%';
```

- [ ] **Step 3: Update `src/lib/credits/spend-store.ts` — add `sourceChain` to record() and update existsByTxHash()**

The full updated file:

```typescript
import { sql } from "../db";

export interface SpendEvent {
  id: number;
  walletAddress: string;
  toolName: string;
  serviceCostMicroUsdc: number;
  chargedAmountMicroUsdc: number;
  markupBps: number;
  txHash: string | null;
  sourceChain: string;
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
    sourceChain?: string;
  }): Promise<void> {
    await sql`
      INSERT INTO spend_events (
        wallet_address, tool_name,
        service_cost_micro_usdc, charged_amount_micro_usdc,
        markup_bps, tx_hash, source_chain
      ) VALUES (
        ${event.walletAddress}, ${event.toolName},
        ${event.serviceCostMicroUsdc}, ${event.chargedAmountMicroUsdc},
        ${event.markupBps}, ${event.txHash ?? null}, ${event.sourceChain ?? "base"}
      )
    `;
  },

  async existsByTxHashAndChain(txHash: string, sourceChain: string): Promise<boolean> {
    const rows = await sql`
      SELECT 1 FROM spend_events WHERE tx_hash = ${txHash} AND source_chain = ${sourceChain} LIMIT 1
    `;
    return rows.length > 0;
  },

  /** @deprecated Use existsByTxHashAndChain for multi-chain support */
  async existsByTxHash(txHash: string): Promise<boolean> {
    const rows = await sql`
      SELECT 1 FROM spend_events WHERE tx_hash = ${txHash} LIMIT 1
    `;
    return rows.length > 0;
  },

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
    sourceChain: (row.source_chain as string) ?? "base",
    createdAt: new Date(row.created_at as string),
  };
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm typecheck`
Expected: Possible errors in files that call `existsByTxHash` — these are fixed in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db-schema.sql src/lib/credits/spend-store.ts
git commit -m "feat: add source_chain to spend_events and composite uniqueness"
```

---

### Task 3: Env Vars for Per-Chain Webhook Keys

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add per-chain Alchemy webhook keys to `env.ts`, keep old key as fallback**

In the `server` block, replace the single `ALCHEMY_WEBHOOK_SIGNING_KEY` entry with:

```typescript
    // Alchemy webhook signature verification (per-chain)
    ALCHEMY_WEBHOOK_KEY_BASE: z.string().optional(),
    ALCHEMY_WEBHOOK_KEY_ETHEREUM: z.string().optional(),
    ALCHEMY_WEBHOOK_KEY_ARBITRUM: z.string().optional(),
    ALCHEMY_WEBHOOK_KEY_OPTIMISM: z.string().optional(),
    // Legacy fallback — used if ALCHEMY_WEBHOOK_KEY_BASE is not set
    ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().optional(),
```

Add corresponding entries to `runtimeEnv` (keep the existing `ALCHEMY_WEBHOOK_SIGNING_KEY` entry — it must remain since it's still in the schema as a fallback):

```typescript
    ALCHEMY_WEBHOOK_KEY_BASE: process.env.ALCHEMY_WEBHOOK_KEY_BASE,
    ALCHEMY_WEBHOOK_KEY_ETHEREUM: process.env.ALCHEMY_WEBHOOK_KEY_ETHEREUM,
    ALCHEMY_WEBHOOK_KEY_ARBITRUM: process.env.ALCHEMY_WEBHOOK_KEY_ARBITRUM,
    ALCHEMY_WEBHOOK_KEY_OPTIMISM: process.env.ALCHEMY_WEBHOOK_KEY_OPTIMISM,
    // Keep existing: ALCHEMY_WEBHOOK_SIGNING_KEY: process.env.ALCHEMY_WEBHOOK_SIGNING_KEY,
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat: add per-chain Alchemy webhook keys to env config"
```

---

### Task 4: Shared Deposit Handler

**Files:**
- Create: `src/lib/credits/deposit-handler.ts`

This extracts the webhook logic into a reusable function shared by all chain-specific webhook routes.

- [ ] **Step 1: Create `src/lib/credits/deposit-handler.ts`**

```typescript
import { createHmac } from "crypto";
import { CreditStore, MICRO_USDC } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { sendTelegramAlert } from "@/lib/telegram";
import { getChainConfig, type ChainKey } from "@/lib/chains";
import { env } from "@/lib/env";

interface AlchemyActivity {
  fromAddress: string;
  toAddress: string;
  value: number;
  asset: string;
  hash: string;
}

interface AlchemyWebhookPayload {
  webhookId: string;
  event: {
    network: string;
    activity: AlchemyActivity[];
  };
}

/** Get the Alchemy webhook signing key for a given chain. */
function getWebhookKey(chain: ChainKey): string | undefined {
  const keyMap: Record<ChainKey, string | undefined> = {
    base: env.ALCHEMY_WEBHOOK_KEY_BASE ?? env.ALCHEMY_WEBHOOK_SIGNING_KEY,
    ethereum: env.ALCHEMY_WEBHOOK_KEY_ETHEREUM,
    arbitrum: env.ALCHEMY_WEBHOOK_KEY_ARBITRUM,
    optimism: env.ALCHEMY_WEBHOOK_KEY_OPTIMISM,
  };
  return keyMap[chain];
}

/**
 * Handle an Alchemy webhook request for a specific chain.
 * Verifies signature, parses USDC transfers to our deposit address,
 * credits user balances, and sends Telegram alerts.
 */
export async function handleDepositWebhook(
  chainKey: ChainKey,
  req: Request
): Promise<Response> {
  const webhookKey = getWebhookKey(chainKey);
  if (!webhookKey) {
    return new Response("Webhook not configured", { status: 501 });
  }

  // Verify Alchemy HMAC-SHA256 signature
  const signature = req.headers.get("x-alchemy-signature");
  const rawBody = await req.text();

  const expectedSig = createHmac("sha256", webhookKey)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSig) {
    console.warn(`[WEBHOOK:${chainKey}] Invalid Alchemy signature — rejecting`);
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as AlchemyWebhookPayload;
  const chainConfig = getChainConfig(chainKey, env.NETWORK);
  if (!chainConfig) {
    console.error(`[WEBHOOK:${chainKey}] No chain config found for network ${env.NETWORK}`);
    return new Response("Chain not configured", { status: 500 });
  }

  const depositAddress = chainConfig.depositAddress.toLowerCase();

  for (const activity of payload.event.activity) {
    if (activity.asset !== "USDC") continue;
    // Must be sent TO our deposit address (not outbound sweeps)
    if (activity.toAddress.toLowerCase() !== depositAddress) continue;

    const senderAddress = activity.fromAddress;
    const amountUsdc = activity.value;
    const amountMicro = MICRO_USDC(amountUsdc);

    try {
      const alreadyProcessed = await SpendEventStore.existsByTxHashAndChain(
        activity.hash,
        chainKey
      );
      if (alreadyProcessed) {
        console.log(`[WEBHOOK:${chainKey}] Skipping already-processed tx ${activity.hash}`);
        continue;
      }

      const account = await CreditStore.get(senderAddress);
      if (account) {
        await CreditStore.credit(senderAddress, amountMicro);
        await SpendEventStore.record({
          walletAddress: senderAddress,
          toolName: "topup",
          serviceCostMicroUsdc: 0,
          chargedAmountMicroUsdc: -amountMicro,
          markupBps: 0,
          txHash: activity.hash,
          sourceChain: chainKey,
        });

        const depositUsdc = (amountMicro / 1_000_000).toFixed(2);
        const newBalance = await CreditStore.get(senderAddress);
        await sendTelegramAlert(
          `*Top-Up Received (${chainConfig.name})*\n\nWallet: \`${senderAddress}\`\nDeposit: *$${depositUsdc}* USDC\nNew balance: $${((newBalance?.balanceMicroUsdc ?? 0) / 1_000_000).toFixed(2)}\nChain: ${chainConfig.name}\nTx: \`${activity.hash}\``
        );

        console.log(`[WEBHOOK:${chainKey}] Credited ${amountUsdc} USDC to ${senderAddress} (tx: ${activity.hash})`);
      } else {
        console.warn(`[WEBHOOK:${chainKey}] USDC deposit from unknown wallet ${senderAddress}`);
      }
    } catch (err) {
      console.error(`[WEBHOOK:${chainKey}] Failed to process activity`, {
        hash: activity.hash,
        sender: senderAddress,
        amount: amountUsdc,
        error: err,
      });
    }
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/credits/deposit-handler.ts
git commit -m "feat: add shared deposit webhook handler with toAddress check and source_chain"
```

---

### Task 5: Per-Chain Webhook Routes + Refactor Existing

**Files:**
- Modify: `src/app/api/credits/webhook/route.ts` (refactor to use shared handler)
- Create: `src/app/api/credits/webhook/ethereum/route.ts`
- Create: `src/app/api/credits/webhook/arbitrum/route.ts`
- Create: `src/app/api/credits/webhook/optimism/route.ts`

- [ ] **Step 1: Refactor existing `src/app/api/credits/webhook/route.ts` to use shared handler**

Replace the entire file with:

```typescript
import { handleDepositWebhook } from "@/lib/credits/deposit-handler";

export async function POST(req: Request) {
  return handleDepositWebhook("base", req);
}
```

- [ ] **Step 2: Create `src/app/api/credits/webhook/ethereum/route.ts`**

```typescript
import { handleDepositWebhook } from "@/lib/credits/deposit-handler";

export async function POST(req: Request) {
  return handleDepositWebhook("ethereum", req);
}
```

- [ ] **Step 3: Create `src/app/api/credits/webhook/arbitrum/route.ts`**

```typescript
import { handleDepositWebhook } from "@/lib/credits/deposit-handler";

export async function POST(req: Request) {
  return handleDepositWebhook("arbitrum", req);
}
```

- [ ] **Step 4: Create `src/app/api/credits/webhook/optimism/route.ts`**

```typescript
import { handleDepositWebhook } from "@/lib/credits/deposit-handler";

export async function POST(req: Request) {
  return handleDepositWebhook("optimism", req);
}
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/credits/webhook/route.ts src/app/api/credits/webhook/ethereum/route.ts src/app/api/credits/webhook/arbitrum/route.ts src/app/api/credits/webhook/optimism/route.ts
git commit -m "feat: per-chain webhook routes using shared deposit handler"
```

---

### Task 6: Extend Confirm Endpoint for Multi-Chain

**Files:**
- Modify: `src/app/api/credits/topup/confirm/route.ts`

The confirm route currently hardcodes Base. Extend it to accept a `sourceChain` parameter and verify on any supported chain.

- [ ] **Step 1: Replace the entire confirm route**

Replace `src/app/api/credits/topup/confirm/route.ts` with this complete file:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http, parseEventLogs, erc20Abi } from "viem";
import { CreditStore } from "@/lib/credits/credit-store";
import { SpendEventStore } from "@/lib/credits/spend-store";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { getChainConfig } from "@/lib/chains";
import { env } from "@/lib/env";
import { sql } from "@/lib/db";
import { sendTelegramAlert } from "@/lib/telegram";
import { getVerifiedWallet } from "@/lib/wallet-auth";

const ConfirmSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  sourceChain: z.string().default("base"),
});

export async function POST(req: Request) {
  // Require authenticated wallet cookie
  const verifiedWallet = getVerifiedWallet(req);
  if (!verifiedWallet) {
    return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { txHash, sourceChain } = parsed.data;
  // Use the verified wallet from cookie — ignore body's walletAddress
  const walletAddress = verifiedWallet;

  // Resolve chain config
  const chainConfig = getChainConfig(sourceChain, env.NETWORK);
  if (!chainConfig) {
    return NextResponse.json({ error: `Unsupported chain: ${sourceChain}` }, { status: 400 });
  }

  // Check idempotency — don't double-credit (scoped to chain)
  const alreadyProcessed = await SpendEventStore.existsByTxHashAndChain(txHash, sourceChain);
  if (alreadyProcessed) {
    const account = await CreditStore.get(walletAddress);
    return NextResponse.json({
      credited: false,
      reason: "already_processed",
      balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
    });
  }

  // Verify the tx on the selected chain
  const client = createPublicClient({
    chain: chainConfig.viemChain,
    transport: http(chainConfig.rpcUrl),
  });

  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (!receipt || receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction not confirmed or failed" }, { status: 400 });
  }

  // Parse USDC Transfer events from the receipt
  const usdcAddress = chainConfig.usdcAddress;

  const purchaser = await getOrCreatePurchaserAccount();
  const purchaserAddress = purchaser.address.toLowerCase();

  let transferAmount = BigInt(0);
  let senderMatch = false;

  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs.filter(
      (l) => l.address.toLowerCase() === usdcAddress.toLowerCase()
    ),
  });

  for (const t of transfers) {
    if (
      t.args.from.toLowerCase() === walletAddress.toLowerCase() &&
      t.args.to.toLowerCase() === purchaserAddress
    ) {
      senderMatch = true;
      transferAmount = t.args.value;
    }
  }

  if (!senderMatch || transferAmount === BigInt(0)) {
    return NextResponse.json(
      { error: "No matching USDC transfer found in this transaction" },
      { status: 400 }
    );
  }

  // USDC has 6 decimals — transferAmount is already in micro-USDC
  const amountMicro = Number(transferAmount);

  // Minimum deposit: $0.01 (10,000 micro-USDC)
  const MIN_DEPOSIT_MICRO = 10_000;
  if (amountMicro < MIN_DEPOSIT_MICRO) {
    return NextResponse.json(
      { error: `Minimum deposit is $0.01 USDC. Received $${(amountMicro / 1_000_000).toFixed(6)}` },
      { status: 400 }
    );
  }

  // Atomic: insert idempotency record + credit balance in one transaction.
  try {
    const results = await sql.transaction([
      sql`
        INSERT INTO spend_events (
          wallet_address, tool_name,
          service_cost_micro_usdc, charged_amount_micro_usdc,
          markup_bps, tx_hash, source_chain
        ) VALUES (
          ${walletAddress}, ${"topup"},
          ${0}, ${-amountMicro},
          ${0}, ${txHash}, ${sourceChain}
        )
      `,
      sql`
        UPDATE credit_accounts
        SET balance_micro_usdc = balance_micro_usdc + ${amountMicro},
            updated_at = now()
        WHERE wallet_address = ${walletAddress}
        RETURNING balance_micro_usdc
      `,
    ]);

    const creditRows = results[1] as Array<Record<string, unknown>>;
    if (creditRows.length === 0) {
      return NextResponse.json(
        { error: "No credit account found for this wallet. Please connect your wallet first." },
        { status: 400 }
      );
    }

    const newBalance = Number(creditRows[0].balance_micro_usdc);
    const depositUsdc = (amountMicro / 1_000_000).toFixed(2);
    await sendTelegramAlert(
      `*Top-Up Received (${chainConfig.name})*\n\nWallet: \`${walletAddress}\`\nDeposit: *$${depositUsdc}* USDC\nNew balance: $${(newBalance / 1_000_000).toFixed(2)}\nChain: ${chainConfig.name}\nTx: \`${txHash}\`\nNetwork: ${env.NETWORK}`
    );

    return NextResponse.json({
      credited: true,
      amountUsdc: amountMicro / 1_000_000,
      balanceMicroUsdc: newBalance,
    });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      const account = await CreditStore.get(walletAddress);
      return NextResponse.json({
        credited: false,
        reason: "already_processed",
        balanceMicroUsdc: account?.balanceMicroUsdc ?? 0,
      });
    }
    console.error("[TOPUP_CONFIRM] Transaction failed", { walletAddress, txHash, sourceChain, error: err });
    return NextResponse.json({ error: "Failed to credit account" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/credits/topup/confirm/route.ts
git commit -m "feat: extend confirm endpoint to verify deposits on any supported chain"
```

---

### Task 7: Update Top-Up API Response

**Files:**
- Modify: `src/app/api/credits/topup/route.ts`

- [ ] **Step 1: Update the topup API to return chain-specific info**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePurchaserAccount } from "@/lib/accounts";
import { CreditStore } from "@/lib/credits/credit-store";
import { env } from "@/lib/env";
import { getChainConfigs } from "@/lib/chains";

const TopUpSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = TopUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  await CreditStore.getOrCreate(parsed.data.walletAddress);

  const treasuryAccount = await getOrCreatePurchaserAccount();
  const configs = getChainConfigs(env.NETWORK);

  const chains: Record<string, { chainId: number; usdcAddress: string; name: string; explorerBaseUrl: string }> = {};
  for (const [key, config] of Object.entries(configs)) {
    chains[key] = {
      chainId: config.chainId,
      usdcAddress: config.usdcAddress,
      name: config.name,
      explorerBaseUrl: config.explorerBaseUrl,
    };
  }

  return NextResponse.json({
    depositAddress: treasuryAccount.address,
    network: env.NETWORK,
    asset: "USDC",
    minimumUsdc: 1.00,
    chains,
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/credits/topup/route.ts
git commit -m "feat: return per-chain deposit info from topup API"
```

---

### Task 8: Wallet Provider — switchChain + sendUsdc with USDC address param

**Files:**
- Modify: `src/components/wallet-provider.tsx`

- [ ] **Step 1: Add multi-chain support to wallet provider**

Key changes:

1. Add `switchChain` to the `WalletContextValue` interface:
```typescript
switchChain: (chainId: number) => Promise<void>;
```

Implementation (add before `sendUsdc`):
```typescript
const switchChain = useCallback(async (chainId: number) => {
  if (typeof window.ethereum === "undefined") throw new Error("No wallet");
  const hexChainId = `0x${chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError: unknown) {
    // 4902 = chain not added. For Ethereum/Arbitrum/Optimism MetaMask
    // already knows them, so 4902 is unlikely. If it happens, re-throw —
    // we don't add chains programmatically since our supported chains
    // are all well-known networks already in MetaMask's default list.
    throw switchError;
  }
}, []);
```

2. Update `sendUsdc` to accept optional `usdcAddress`:
```typescript
// Change signature:
sendUsdc: (to: string, amountUsdc: number, usdcAddress?: string) => Promise<string>;

// In implementation, change the contract address line:
const usdcContract = usdcAddress ?? USDC_ADDRESS[network];
```

3. Add `switchChain` to the Provider value.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/wallet-provider.tsx
git commit -m "feat: add switchChain and multi-chain sendUsdc to wallet provider"
```

---

### Task 9: Top-Up Sheet — Chain Picker UI

**Files:**
- Modify: `src/components/topup-sheet.tsx`

This is the largest UI change. Add a chain selector before the amount picker.

- [ ] **Step 1: Add chain picker and chain-switching logic to TopUpSheet**

Key changes to `src/components/topup-sheet.tsx`:

1. Import chain configs and add chain state:
```typescript
import { type ChainKey } from "@/lib/chains";

// Inside TopUpSheet component:
const [selectedChain, setSelectedChain] = useState<string>("base");
const [chainSwitching, setChainSwitching] = useState(false);
```

2. The `depositInfo` response now includes `chains` object. Add state and update the fetch handler:
```typescript
const [chainConfigs, setChainConfigs] = useState<Record<string, { chainId: number; usdcAddress: string; name: string; explorerBaseUrl: string }> | null>(null);
```

Replace the existing `.then((data) => { ... })` block in the `useEffect` fetch with:
```typescript
.then((data) => {
  setDepositInfo({ depositAddress: data.depositAddress, network: data.network });
  if (data.chains) setChainConfigs(data.chains);
  setTopUpStatus("idle");
})
```

3. Add a chain picker row (shown only when `chainConfigs` has multiple entries):
```tsx
{chainConfigs && Object.keys(chainConfigs).length > 1 && (
  <div className="space-y-3">
    <label className="text-sm font-medium text-foreground">Select chain</label>
    <div className="grid grid-cols-4 gap-2">
      {Object.entries(chainConfigs).map(([key, chain]) => {
        const selected = selectedChain === key;
        return (
          <button
            key={key}
            onClick={() => handleChainSelect(key)}
            disabled={chainSwitching}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium border-2 transition-all duration-200",
              selected
                ? "bg-blue-500/15 border-blue-500/50 text-blue-200"
                : "bg-muted/30 border-transparent text-muted-foreground hover:border-muted-foreground/20"
            )}
          >
            <span className="text-sm font-semibold">{chain.name}</span>
          </button>
        );
      })}
    </div>
  </div>
)}
```

4. Chain selection handler that switches MetaMask chain:
```typescript
const handleChainSelect = useCallback(async (chainKey: string) => {
  if (!chainConfigs || chainKey === selectedChain) return;
  const chain = chainConfigs[chainKey];
  if (!chain) return;

  setChainSwitching(true);
  try {
    await switchChain(chain.chainId);
    setSelectedChain(chainKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to switch chain";
    if (!(msg.includes("User denied") || msg.includes("rejected"))) {
      setTopUpError(`Chain switch failed: ${msg}`);
    }
  } finally {
    setChainSwitching(false);
  }
}, [chainConfigs, selectedChain, switchChain]);
```

5. Update `handleSendTopUp` to use the selected chain's USDC address and pass `sourceChain` to confirm:
```typescript
const selectedConfig = chainConfigs?.[selectedChain];
const txHash = await sendUsdc(depositInfo.depositAddress, topUpAmount, selectedConfig?.usdcAddress);
// ...
const res = await fetch("/api/credits/topup/confirm", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ walletAddress, txHash, sourceChain: selectedChain }),
});
```

6. Update the manual fallback section to show selected chain context:
```tsx
<p className="text-xs font-medium text-muted-foreground">
  Or send USDC manually on {selectedConfig?.name ?? "Base"} to:
</p>
```

7. Update explorer base URL to use selected chain:
```typescript
const explorerBase = chainConfigs?.[selectedChain]?.explorerBaseUrl ?? (network === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org");
```

8. Add `switchChain` to the destructured `useWallet()` call.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Test manually in browser**

Start dev server: `pnpm dev`
1. Open `/chat`, connect wallet, open top-up sheet
2. On testnet: should show only Base (no chain picker)
3. Verify amount selection and send flow still works on Base

- [ ] **Step 4: Commit**

```bash
git add src/components/topup-sheet.tsx
git commit -m "feat: add chain picker to top-up sheet with MetaMask chain switching"
```

---

### Task 10: Multi-Chain Sweep Script

**Files:**
- Create: `scripts/sweep-multichain.ts`

- [ ] **Step 1: Create `scripts/sweep-multichain.ts`**

Follow the pattern of existing `scripts/sweep.ts` but iterate over multiple chains. The script:

1. Parses args: `--to`, `--chain` (optional, defaults to all non-Base), `--dry-run`
2. For each chain, creates a viem PublicClient, checks USDC balance
3. If above threshold ($50), creates a CDP account scoped to that network and uses `sendTransaction` to transfer USDC to the target address
4. Logs results and sends Telegram alerts

```typescript
#!/usr/bin/env npx tsx
/**
 * Sweep USDC from CDP-managed wallets on non-Base chains.
 *
 * Usage:
 *   npx tsx scripts/sweep-multichain.ts --to 0xYourAddress --dry-run
 *   npx tsx scripts/sweep-multichain.ts --to 0xYourAddress --chain ethereum
 *   npx tsx scripts/sweep-multichain.ts --to 0xYourAddress
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, parseAbi, formatUnits, type Hex } from "viem";
import { mainnet, arbitrum, optimism, base } from "viem/chains";
import { toAccount } from "viem/accounts";
import { createWalletClient } from "viem";

const CHAINS = {
  ethereum: {
    name: "Ethereum",
    cdpNetwork: "ethereum",
    viemChain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Hex,
    rpcUrl: "https://eth.llamarpc.com",
  },
  arbitrum: {
    name: "Arbitrum",
    cdpNetwork: "arbitrum",
    viemChain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Hex,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    name: "Optimism",
    cdpNetwork: "optimism",
    viemChain: optimism,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Hex,
    rpcUrl: "https://mainnet.optimism.io",
  },
} as const;

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const SWEEP_THRESHOLD_MICRO = 50_000_000; // $50 USDC

// Parse args
const args = process.argv.slice(2);
const toIndex = args.indexOf("--to");
const chainIndex = args.indexOf("--chain");
const dryRun = args.includes("--dry-run");

const targetAddress = toIndex >= 0 ? args[toIndex + 1] : null;
const chainFilter = chainIndex >= 0 ? args[chainIndex + 1] : null;

if (!targetAddress || !/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
  console.error("Usage: npx tsx scripts/sweep-multichain.ts --to 0xAddress [--chain ethereum|arbitrum|optimism] [--dry-run]");
  process.exit(1);
}

async function main() {
  console.log(`Target: ${targetAddress}`);
  console.log(`Threshold: $${SWEEP_THRESHOLD_MICRO / 1_000_000} USDC`);
  if (dryRun) console.log("MODE: DRY RUN\n");

  const cdp = new CdpClient();
  const chainsToSweep = chainFilter
    ? { [chainFilter]: CHAINS[chainFilter as keyof typeof CHAINS] }
    : CHAINS;

  for (const [key, chain] of Object.entries(chainsToSweep)) {
    if (!chain) {
      console.error(`Unknown chain: ${key}`);
      continue;
    }

    console.log(`\n--- ${chain.name} ---`);

    const publicClient = createPublicClient({
      chain: chain.viemChain,
      transport: http(chain.rpcUrl),
    });

    // Get purchaser address from CDP (network-scoped for signing)
    const cdpAccount = await cdp.evm.getOrCreateAccount({
      name: "Purchaser",
      network: chain.cdpNetwork,
    });
    const address = cdpAccount.address as Hex;
    console.log(`  Address: ${address}`);

    const balance = await publicClient.readContract({
      address: chain.usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    const balanceFormatted = formatUnits(balance, 6);
    console.log(`  USDC balance: ${balanceFormatted}`);

    if (Number(balance) < SWEEP_THRESHOLD_MICRO) {
      console.log(`  Below threshold ($${SWEEP_THRESHOLD_MICRO / 1_000_000}), skipping.`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would transfer ${balanceFormatted} USDC to ${targetAddress}`);
      continue;
    }

    console.log(`  Sweeping ${balanceFormatted} USDC to ${targetAddress}...`);

    // Use CDP account on the target network for signing
    const viemAccount = toAccount(cdpAccount);
    const walletClient = createWalletClient({
      account: viemAccount,
      chain: chain.viemChain,
      transport: http(chain.rpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: chain.usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [targetAddress as Hex, balance],
    });

    console.log(`  Tx: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  Status: ${receipt.status === "success" ? "confirmed" : "FAILED"}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Multi-chain sweep failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsx --check scripts/sweep-multichain.ts` (or just run with `--dry-run`)

- [ ] **Step 3: Commit**

```bash
git add scripts/sweep-multichain.ts
git commit -m "feat: add multi-chain sweep script for Ethereum, Arbitrum, Optimism"
```

---

### Task 11: Operational Documentation

**Files:**
- Create: `docs/ops/sweep.md`
- Create: `docs/ops/webhooks.md`
- Create: `docs/ops/multi-chain.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/ops/sweep.md`**

```markdown
# Wallet Sweep Operations

## Single-Chain Sweep (Base Only)

```bash
# Preview balances
npx tsx scripts/sweep.ts --to 0xYourColdWallet --dry-run

# Sweep both purchaser and seller wallets
npx tsx scripts/sweep.ts --to 0xYourColdWallet

# Sweep specific wallet
npx tsx scripts/sweep.ts --to 0xYourColdWallet --wallet purchaser
```

## Multi-Chain Sweep (Ethereum, Arbitrum, Optimism)

Sweeps USDC from the CDP purchaser wallet on non-Base chains.
Only sweeps if balance exceeds $50 (configurable in script).

```bash
# Preview all chain balances
npx tsx scripts/sweep-multichain.ts --to 0xYourAddress --dry-run

# Sweep all chains
npx tsx scripts/sweep-multichain.ts --to 0xYourAddress

# Sweep specific chain
npx tsx scripts/sweep-multichain.ts --to 0xYourAddress --chain ethereum
```

The target address can be a cold wallet, a bridge address, or an exchange
deposit address. Bridging to Base is a manual step after the sweep.

Requires: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` in `.env.local`
```

- [ ] **Step 2: Create `docs/ops/webhooks.md`**

```markdown
# Alchemy Webhook Setup

Each supported chain needs an Alchemy "Address Activity" webhook watching
the purchaser wallet for USDC transfers.

## Purchaser Wallet

`0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e` (same address on all EVM chains)

## Webhook Endpoints

| Chain    | Endpoint URL                              | Env Var                        |
|----------|-------------------------------------------|--------------------------------|
| Base     | `https://obolai.xyz/api/credits/webhook`  | `ALCHEMY_WEBHOOK_KEY_BASE`     |
| Ethereum | `https://obolai.xyz/api/credits/webhook/ethereum` | `ALCHEMY_WEBHOOK_KEY_ETHEREUM` |
| Arbitrum | `https://obolai.xyz/api/credits/webhook/arbitrum` | `ALCHEMY_WEBHOOK_KEY_ARBITRUM` |
| Optimism | `https://obolai.xyz/api/credits/webhook/optimism` | `ALCHEMY_WEBHOOK_KEY_OPTIMISM` |

## Setup Steps (per chain)

1. Go to Alchemy Dashboard > Notify > Create Webhook
2. Select chain network (e.g., ETH Mainnet)
3. Webhook type: Address Activity
4. Address: `0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e`
5. Set the webhook URL from the table above
6. Copy the signing key and set the corresponding env var on Vercel

## Testing

Send a small USDC amount to the purchaser address on the target chain.
Check Vercel function logs for `[WEBHOOK:ethereum]` entries.

## Legacy Migration

The old `ALCHEMY_WEBHOOK_SIGNING_KEY` env var is still supported as a
fallback for the Base webhook. Once `ALCHEMY_WEBHOOK_KEY_BASE` is set,
the old var can be removed.
```

- [ ] **Step 3: Create `docs/ops/multi-chain.md`**

```markdown
# Multi-Chain Deposit Configuration

## Supported Chains

| Chain    | Chain ID | USDC Contract                              | Explorer              |
|----------|----------|--------------------------------------------|-----------------------|
| Base     | 8453     | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | basescan.org          |
| Ethereum | 1        | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | etherscan.io          |
| Arbitrum | 42161    | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | arbiscan.io           |
| Optimism | 10       | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | optimistic.etherscan.io |

## Deposit Address

All chains: `0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e` (CDP-managed Purchaser wallet)

## How It Works

1. User selects chain in top-up sheet
2. MetaMask switches to that chain
3. User signs USDC transfer to deposit address
4. Confirm endpoint verifies the tx on the selected chain's RPC
5. Credits are added instantly to the user's Obol balance
6. Alchemy webhooks serve as a backup for manual deposits

## Env Vars Required

See `webhooks.md` for Alchemy webhook keys. No additional env vars needed
beyond the existing CDP credentials — the same CDP account works on all chains.

## Adding a New Chain

1. Add entry to `SUPPORTED_CHAINS` in `src/lib/chains.ts`
2. Create `src/app/api/credits/webhook/<chain>/route.ts` (3 lines)
3. Add `ALCHEMY_WEBHOOK_KEY_<CHAIN>` to `src/lib/env.ts`
4. Set up Alchemy webhook (see `webhooks.md`)
5. Deploy
```

- [ ] **Step 4: Add reference to `CLAUDE.md`**

After the `### Scripts` section (which ends with the sweep usage examples) and before `## Architecture Overview`, add:

```markdown
### Operational Docs

See `docs/ops/` for operational runbooks:
- `sweep.md` — Single-chain and multi-chain wallet sweep instructions
- `webhooks.md` — Alchemy webhook setup per chain
- `multi-chain.md` — Chain config reference, deposit addresses, adding new chains
```

- [ ] **Step 5: Add "Supported Deposit Chains" section to `README.md`**

Add before the existing "Getting Started" or "Setup" section:

```markdown
## Supported Deposit Chains

Users can deposit USDC from any of these chains. All deposits are credited instantly to the user's Obol balance.

| Chain    | Chain ID | USDC Contract                                | Deposit Address |
|----------|----------|----------------------------------------------|-----------------|
| Base     | 8453     | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x58F3...` |
| Ethereum | 1        | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `0x58F3...` |
| Arbitrum | 42161    | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `0x58F3...` |
| Optimism | 10       | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `0x58F3...` |

All chains share the same deposit address: the CDP-managed Purchaser wallet.
See `docs/ops/multi-chain.md` for full configuration details.
```

- [ ] **Step 6: Commit**

```bash
git add docs/ops/ CLAUDE.md README.md
git commit -m "docs: add operational runbooks for multi-chain deposits, webhooks, sweep"
```

---

## Task Dependency Order

```
Task 1 (chains.ts) ─────────────────────────────────────────┐
Task 2 (DB + spend-store) ───────────────────────────────────┤
Task 3 (env vars) ───────────────────────────────────────────┤
                                                              ├─► Task 4 (deposit handler)
                                                              │       │
                                                              │       ├─► Task 5 (webhook routes)
                                                              │       └─► Task 6 (confirm endpoint)
                                                              │
                                                              ├─► Task 7 (topup API)
                                                              │       │
                                                              ├─► Task 8 (wallet provider)
                                                              │       │
                                                              │       └─► Task 9 (top-up sheet UI)
                                                              │
                                                              ├─► Task 10 (sweep script)
                                                              └─► Task 11 (docs)
```

Tasks 1, 2, 3 can be done in parallel. Tasks 4-11 depend on the first three. Tasks 5 and 6 depend on 4. Task 9 depends on 7 and 8.
