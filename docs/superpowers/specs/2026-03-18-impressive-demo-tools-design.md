# x402 AI Agent — Impressive Demo Tools Design

**Date:** 2026-03-18
**Status:** Draft
**Goal:** Replace placeholder paid tools with real, impressive tools that showcase x402 micropayment scenarios across multiple categories.

---

## 1. Problem

The current paid tools (`premium_random` at $0.01, `premium_analysis` at $0.02) are trivial demos that don't justify payment. The `hello-remote` and `hello-local` tools are indistinguishable to users. The payment infrastructure is solid but the tools don't match its quality.

## 2. Design Principles

- **Real value, real payments** — each paid tool does something genuinely useful that justifies the micropayment
- **No new API keys** — all tools work with existing credentials (CDP, DeepSeek) or free public APIs
- **Graceful degradation** — if an external API is down, the tool returns a clear error, not a crash
- **x402 sweet spot** — prices in the $0.01-$0.05 range where traditional payment (Stripe $0.50 minimum) fails

## 3. Tool Catalog

### 3.1 Free Tools (keep)

| Tool | Description | Purpose |
|------|-------------|---------|
| `add` | Add two numbers | Free baseline, trivial compute |
| `get_random_number` | Random number between min/max | Free baseline |

### 3.2 Paid Tools (new)

| Tool | Category | Price | Description |
|------|----------|-------|-------------|
| `get_crypto_price` | Pay-per-query data | $0.01 | Live token price, 24h change, market cap |
| `get_wallet_profile` | Pay-per-query data | $0.02 | ETH/USDC balances, tx count for any address on Base |
| `summarize_url` | Pay-per-compute AI | $0.03 | Fetch webpage + AI summary via DeepSeek |
| `analyze_contract` | Pay-per-verification | $0.03 | Fetch verified source from Basescan + AI analysis |
| `generate_image` | Pay-per-compute AI | $0.05 | AI image generation via Pollinations.ai |

### 3.3 Meta Tools (keep, free)

| Tool | Description |
|------|-------------|
| `check_budget` | Remaining USDC budget for session |
| `search_x402_services` | Search registry by query/category |
| `probe_x402_service` | Connect to MCP server, discover tools |
| `list_registered_services` | List all registered services |

### 3.4 Removed Tools

| Tool | Reason |
|------|--------|
| `premium_random` | Trivial — same as free tool with a prefix |
| `premium_analysis` | Trivial — basic math, not worth paying for |
| `hello-remote` | Indistinguishable from hello-local to users |
| `hello-local` | Same greeting, different transport — not demo-worthy |

## 4. Tool Implementation Details

### 4.1 `get_crypto_price` ($0.01)

- **Input:** `{ token: z.string() }` — e.g., "bitcoin", "ethereum", "usdc"
- **Backend:** CoinGecko free API (no key): `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
- **Output:** `{ token, priceUsd, change24h, marketCap }`
- **Error handling:** CoinGecko rate limits at ~10-30 req/min. On 429, return error text.
- **Why paid:** "Pay-per-query beats $99/mo data subscription" — the x402 micropayment story.

### 4.2 `get_wallet_profile` ($0.02)

- **Input:** `{ address: z.string() }` — any EVM address
- **Network:** Always uses `env.NETWORK` (Base Sepolia in dev, Base mainnet in prod). The tool queries the same network the payment system uses.
- **Backend:** Public Base RPC via viem:
  - `getBalance(address)` for ETH
  - ERC-20 `balanceOf()` on USDC contract (selected by `env.NETWORK`):
    - Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
    - Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - `getTransactionCount(address)` for tx count
- **Output:** `{ address, ethBalance, usdcBalance, transactionCount, network }`
- **No external API key needed** — uses public RPC.
- **Why paid:** On-chain data query, demonstrates "pay per use instead of subscribing to Alchemy/Infura."

### 4.3 `summarize_url` ($0.03)

- **Input:** `{ url: z.string().url() }` — any public URL
- **Backend:**
  1. `fetch(url)` with timeout (10s)
  2. Strip HTML tags, take first ~3000 chars of text content
  3. Call DeepSeek with summarization prompt using existing `DEEPSEEK_API_KEY` or AI Gateway
- **Output:** `{ url, summary, wordCount }`
- **Error handling:** Timeout or fetch failure returns error text. Non-HTML content (PDF, etc.) returns "unsupported content type."
- **Why paid:** Real AI compute cost — the tool provider pays for inference, micropayment covers it.

### 4.4 `analyze_contract` ($0.03)

- **Input:** `{ address: z.string() }` — contract address on Base
- **Network:** Uses `env.NETWORK` to select endpoint — `api-sepolia.basescan.org` for Base Sepolia, `api.basescan.org` for Base mainnet.
- **Backend:**
  1. Fetch from Basescan API: `https://${basescanHost}/api?module=contract&action=getsourcecode&address=${address}`
  2. If verified, send source to DeepSeek with analysis prompt (purpose, key functions, risks)
  3. If not verified, return `{ isVerified: false }` with a message
- **Output:** `{ address, contractName, isVerified, analysis }`
- **Rate limiting:** Basescan unauthenticated API allows ~1 req/5s per IP. This is acceptable for a demo (users won't analyze contracts rapidly). If rate limiting becomes an issue, add an optional `BASESCAN_API_KEY` env var (free tier, 5 req/s). The tool should handle 429 responses gracefully with an error message.
- **Why paid:** Combines on-chain data retrieval + AI analysis — genuine compute cost.

### 4.5 `generate_image` ($0.05)

- **Input:** `{ prompt: z.string(), width?: z.number().default(512), height?: z.number().default(512) }`
- **Backend:** Pollinations.ai (free, no API key): `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`
- **Output:** `{ prompt, imageUrl }` — the Pollinations URL is session-lived (may be evicted from cache over time; do not store long-term).
- **Rendering:** The image is rendered in **one place only** — the tool output card in `ToolOutput` shows an inline `<img>`. The agent's text response should reference the image but NOT repeat the URL as markdown `![](...)` to avoid duplicate display.
- **Why paid:** Most expensive tool — wraps a compute-intensive service. Demonstrates "micropayments for AI compute."

## 5. UI Polish

### 5.1 Tool-Specific Rich Rendering

Extend `renderRawOutput` in `tool.tsx` to detect tool names and render custom layouts:

| Tool | Rendering |
|------|-----------|
| `get_crypto_price` | Large price, green/red 24h change arrow, market cap label |
| `get_wallet_profile` | Truncated address + copy button, ETH/USDC balance cards, tx count badge |
| `generate_image` | Inline `<img>` with prompt caption |
| `summarize_url` | URL link header, summary text, word count badge |
| `analyze_contract` | Contract name header, verified/unverified badge, analysis as markdown |

Detection: use `part.toolName` (already available in the component).

### 5.2 Payment Amount Display

Current: "Payment Successful via x402" + tx link.
New: "Payment Successful · $0.03 USDC · via x402" + tx link.

Extract amount from `x402.payment-response.amount` (micro-USDC, divide by 1e6).

### 5.3 Updated Suggestions

Replace current suggestions to match new tools:

```typescript
const suggestions = {
  "Check crypto price": "What's the current price of Ethereum?",
  "Analyze a wallet": "Show me the wallet profile for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "Summarize a page": "Summarize https://x402.org for me",
  "Generate art": "Generate an image of a cyberpunk cityscape at sunset",
};
```

### 5.4 Budget Indicator in Prompt Bar

Add a persistent budget display near the model selector in the prompt input toolbar:

```
[ $0.47 remaining ]  [DeepSeek Chat v]  [Send ->]
```

Requires passing budget state from the chat API to the client. Options:
- Include remaining budget in `messageMetadata` on each response
- Or use a separate lightweight `/api/budget` endpoint

Recommend: include in `messageMetadata` alongside `network` — no new endpoint needed. Note: `messageMetadata` is evaluated per message event, so the budget value reflects the state at stream time. Mid-stream payment deductions from `onStepFinish` will be reflected in subsequent messages but not retroactively. This is acceptable for a demo — the budget display updates after each tool call completes, not in real-time during a tool call.

### 5.5 Dynamic Paid Tool Detection

Replace hardcoded `PAID_TOOLS` array with runtime detection:
- A tool is "paid" if its output contains `_meta["x402.payment-response"]`
- For pre-completion state (before output), check if tool name is in a list derived from MCP server metadata, or simply show all tools with the same neutral style until payment is confirmed

Simplest approach: update the `PAID_TOOLS` array to the new tool names (`get_crypto_price`, `get_wallet_profile`, `summarize_url`, `analyze_contract`, `generate_image`). This list is only used for **pre-completion styling** (showing the amber "Paid Tool" badge before the tool returns). Once a tool completes, `_meta["x402.payment-response"]` in the output already drives the payment badge dynamically. Full dynamic pre-completion detection is a nice-to-have for later.

## 6. Other Changes

### 6.1 maxDuration Increase

Change `export const maxDuration = 30` to `60` in `src/app/api/chat/route.ts`. Current MCP client connection (~2.8s) + multi-step agent (up to 15s per step) exceeds 30s.

### 6.2 Deploy Script Fix (done)

Stop x402 service before build in `deploy-vps.sh` to free RAM on 2GB VPS. Already applied.

## 7. Files to Modify

| File | Change |
|------|--------|
| `src/app/mcp/route.ts` | Remove old paid tools, add 5 new paid tools, remove hello-remote |
| `src/app/api/chat/route.ts` | Remove hello-local from `localTools`, pass `localTools: {}` (keep the injection point for future use), bump maxDuration to 60 |
| `src/components/ai-elements/tool.tsx` | Rich rendering per tool, payment amount display, update PAID_TOOLS list |
| `src/app/page.tsx` | Update suggestions, add budget indicator in prompt bar |

## 8. No New Dependencies

All tools use:
- `fetch` (built-in) for CoinGecko, Basescan, Pollinations
- `viem` (already installed) for Base RPC calls
- DeepSeek via existing `DEEPSEEK_API_KEY` / AI Gateway for AI-powered tools
- `zod` (already installed) for input validation

## 9. Testing Strategy

- **Unit tests:** Not needed for MCP tool handlers (they're thin wrappers around fetch calls)
- **Manual testing:** Each tool via the chat UI with suggestions
- **Budget:** Session budget of $0.50 allows 10-50 calls across the tool price range
- **Testnet:** All on Base Sepolia with test USDC

## 10. Pricing Rationale

| Price Point | Tools | Justification |
|-------------|-------|---------------|
| $0.01 | `get_crypto_price` | Simple data lookup, minimal compute |
| $0.02 | `get_wallet_profile` | Multiple RPC calls, more data |
| $0.03 | `summarize_url`, `analyze_contract` | AI inference cost (DeepSeek) |
| $0.05 | `generate_image` | Most compute-intensive (image generation) |

The $0.50 session budget allows a demo user to call the most expensive tool 10 times, or mix across all tools for 15-25 calls — plenty for a demo session.
