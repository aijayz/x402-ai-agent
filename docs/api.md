# Obol Public API v1

Base URL: `https://www.obolai.xyz/api/v1`

## Overview

Obol AI exposes crypto research intelligence via two interfaces:

- **REST API** — standard HTTP endpoints documented below
- **MCP (Model Context Protocol)** — AI-native tool discovery at `/mcp`

Free endpoints require no authentication. Paid endpoints use the **x402 protocol** — HTTP-native USDC micropayments on Base. Payment IS authentication; no API keys needed.

---

## Free Tier

Rate limited at **60 requests/hour** per IP. No authentication required.

### `GET /api/v1/digest/latest`

Returns the most recent daily intelligence digest.

**Response:**
```json
{
  "date": "2026-03-28",
  "title": "Daily Intelligence Digest — March 28, 2026",
  "content": "## Market Overview\n...",
  "markers": [...],
  "tokenCount": 10,
  "generatedAt": "2026-03-28T00:05:12Z"
}
```

### `GET /api/v1/digest/:date`

Returns digest for a specific date. Date format: `YYYY-MM-DD`.

Returns `404` if no digest exists for that date.

### `GET /api/v1/tokens`

Lists all tracked token symbols with the current snapshot date.

**Response:**
```json
{
  "tokens": ["ADA", "AVAX", "BNB", "BTC", "DOGE", "ETH", "LINK", "POL", "SOL", "XRP"],
  "snapshotDate": "2026-03-28"
}
```

### `GET /api/v1/tokens/:symbol`

Returns intelligence snapshot for a token.

**Response:**
```json
{
  "symbol": "BTC",
  "name": "Bitcoin",
  "snapshotDate": "2026-03-28",
  "security": { "score": 95, "details": "No known vulnerabilities" },
  "whaleFlow": {
    "netFlowUsd": -12400000,
    "largeTxCount": 847,
    "totalVolumeUsd": 89000000
  },
  "sentiment": {
    "score": 68,
    "label": "bullish",
    "summary": "Institutional accumulation continues amid ETF inflow records"
  },
  "unlocks": null
}
```

---

## Paid Tier (x402)

All paid endpoints are `POST`. No rate limit — each call costs USDC, which is the throttle.

### x402 Payment Flow

1. Call endpoint without payment header → receive `402 Payment Required` with payment terms
2. Sign an EIP-3009 USDC authorization on Base using the returned `accepts` requirements
3. Retry the same request with the signed payment in an `X-Payment` or `Payment` header
4. Coinbase facilitator verifies and settles the payment on-chain
5. Endpoint executes and returns results

**402 Response:**
```json
{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "50000",
    "payTo": "0x545442553E692D0900005d7e48885684Daa0C4f0",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "maxTimeoutSeconds": 300,
    "resource": "/api/v1/research/defi-safety",
    "mimeType": "application/json",
    "description": "DeFi Safety Analysis"
  }]
}
```

Use the `@x402/fetch` package to handle payment automatically:
```typescript
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { toClientEvmSigner, registerExactEvmScheme } from "@x402/evm";

const client = new x402Client();
registerExactEvmScheme(client, { signer: toClientEvmSigner(walletClient.account) });
const paidFetch = wrapFetchWithPayment(fetch, client);

const res = await paidFetch("https://www.obolai.xyz/api/v1/research/defi-safety", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ target: "0x...", chain: "ethereum" }),
});
```

### Response Envelope

All paid endpoints return the same envelope:
```json
{
  "endpoint": "defi-safety",
  "summary": "Analyzed 0x... for DeFi safety risks.",
  "data": { ... },
  "costUsdc": 0.11,
  "generatedAt": "2026-03-29T10:15:00Z"
}
```

### `POST /api/v1/research/defi-safety` ($0.05–$0.15)

Analyze a token or contract for rug pull risks, honeypot detection, and vulnerabilities.

**Input:**
```json
{ "target": "0x...", "depth": "quick", "chain": "ethereum" }
```

- `target` (required) — Token address, contract address, or token name
- `depth` — `"quick"` ($0.05) or `"full"` ($0.15)
- `chain` — `"base"` | `"ethereum"` | `"arbitrum"` | `"optimism"` (default: `"ethereum"`)

**Data fields:** `security`, `riskAssessment`, `tokenUnlocks`, `onChain.liquidationRisk`, `onChain.dexDepth`

### `POST /api/v1/research/whale-activity` (~$0.02)

Track whale and smart money activity for a wallet or token address.

**Input:**
```json
{ "address": "0x...", "chain": "base" }
```

- `address` (required) — EVM address (0x + 40 hex chars)
- `chain` — default: `"base"`

**Data fields:** `walletRisk`, `whaleMovements`, `recentTrades`, `onChain.whaleFlow`, `onChain.smartMoney`

### `POST /api/v1/research/wallet-portfolio` (~$0.02)

Deep-dive wallet analysis: risk profile, trade history, and 30-day PnL.

**Input:**
```json
{ "address": "0x...", "chain": "base" }
```

**Data fields:** `walletRisk`, `holdings`, `recentTrades`, `onChain.pnl30d`

### `POST /api/v1/research/social-narrative` (~$0.17)

Analyze social narrative and market sentiment for a topic.

**Input:**
```json
{ "topic": "ethereum merge", "chain": "ethereum" }
```

- `topic` (required) — Free text or an EVM address
- `chain` — default: `"ethereum"`

**Data fields:** `sentiment`, `riskAssessment`

### `POST /api/v1/research/token-alpha` (~$0.33)

Screen a token for alpha signals: security, unlock schedule, allocation breakdown.

**Input:**
```json
{ "target": "AAVE", "chain": "ethereum" }
```

- `target` (required) — Token name, symbol, or contract address
- `chain` — default: `"ethereum"`

**Data fields:** `security`, `tokenomics.unlocks`, `tokenomics.allocations`, `onChain.smartMoney`, `onChain.velocity`

### `POST /api/v1/research/market-trends` (~$0.04)

Analyze market trends with sentiment, DEX volume, and stablecoin supply data.

**Input:**
```json
{ "query": "DeFi lending rates", "contractAddress": "0x...", "chain": "ethereum" }
```

- `query` (required) — Market trend query
- `contractAddress` (optional) — For contract audit
- `chain` — default: `"ethereum"`

**Data fields:** `sentiment`, `onChain.dexVolume`, `onChain.stablecoinSupply`

---

## MCP (Model Context Protocol)

Connect any MCP-compatible AI agent to `https://www.obolai.xyz/mcp`.

### Free Tools (no payment)
- `get_daily_digest` — Latest intelligence digest
- `list_tracked_tokens` — All tracked token symbols
- `get_token_snapshot` — Token intelligence snapshot by symbol

### Paid Tools (x402 via `_meta["x402/payment"]`)
- `get_crypto_price` ($0.01) — Live price, 24h change, market cap
- `get_wallet_profile` ($0.02) — ETH/USDC balance, tx count
- `summarize_url` ($0.03) — Webpage fetch + AI summary
- `analyze_contract` ($0.03) — Smart contract source analysis
- `generate_image` ($0.05) — AI image generation
- `analyze_defi_safety` ($0.05–$0.15) — DeFi rug pull / vulnerability scan
- `track_whale_activity` (~$0.02) — Whale and smart money tracking
- `analyze_wallet_portfolio` (~$0.02) — Wallet risk + PnL analysis
- `analyze_social_narrative` (~$0.17) — Social sentiment analysis
- `screen_token_alpha` (~$0.33) — Token alpha signal screening
- `analyze_market_trends` (~$0.04) — Market trend analysis

### Connection Example
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("https://www.obolai.xyz/mcp"));
const client = new Client({ name: "my-agent", version: "1.0" });
await client.connect(transport);

const tools = await client.listTools();
const result = await client.callTool({ name: "get_daily_digest", arguments: {} });
```

---

## Rate Limiting

| Tier | Limit | Scope |
|------|-------|-------|
| Free endpoints (`/api/v1/digest/*`, `/api/v1/tokens/*`) | 60 req/hour | Per IP |
| Paid endpoints (`/api/v1/research/*`) | Unlimited | x402 payment is the throttle |
| MCP (`/mcp`) | 10 req/min (anon), 40 req/min (auth) | Per IP or wallet |

When rate limited, you'll receive a `429` response with a `Retry-After` header.

---

## Testnet

On `base-sepolia`, paid endpoints work with testnet USDC and the testnet facilitator at `https://x402.org/facilitator`. Get testnet USDC from https://faucet.circle.com/.
