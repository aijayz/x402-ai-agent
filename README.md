# x402 AI Agent

An autonomous AI agent that discovers, evaluates, budgets, and pays for external API services using USDC on Base via the [x402](https://x402.org) protocol.

Built with Next.js 15, AI SDK v6, and Coinbase CDP wallets.

## Features

- **ToolLoopAgent orchestrator** -- multi-step reasoning with budget awareness (max 10 steps)
- **Autonomous x402 payments** -- handles 402 Payment Required responses automatically via `withPayment()`
- **Per-session budget** -- $0.50 USDC advisory limit with payment audit trail and structured telemetry
- **Service discovery** -- in-memory registry + agent tools to search, probe, and list x402 services
- **AI Gateway support** -- Vercel OIDC for production, direct DeepSeek fallback for local dev
- **MCP server** -- remote MCP server with free and paid tools
- **Streaming chat UI** -- AI SDK v6 `useChat` + ai-elements components

## Quick Start

### Prerequisites

- **Node.js 18+** and **pnpm** (`corepack enable`)
- **Coinbase CDP credentials** -- [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/)
- **DeepSeek API key** -- [platform.deepseek.com](https://platform.deepseek.com/)

### 1. Clone and install

```bash
git clone https://github.com/aijayz/x402-ai-agent
cd x402-ai-agent
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```bash
# CDP Credentials (required -- wallets won't work without these)
CDP_API_KEY_ID=your_key_id
CDP_API_KEY_SECRET=your_secret
CDP_WALLET_SECRET=your_wallet_secret

# DeepSeek API (required for local dev without AI Gateway)
DEEPSEEK_API_KEY=your_deepseek_key

# Network (base-sepolia for testnet, base for mainnet)
NETWORK=base-sepolia
URL=http://localhost:3000
```

**Getting CDP credentials:**

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/)
2. Create a new project
3. Generate API keys -- save the key ID and secret
4. Create a wallet secret (used to encrypt wallet data)

### 3. Fund your testnet wallet

On first run, the app auto-creates CDP-managed wallets and requests faucet funds on `base-sepolia`. If the faucet is slow, fund manually:

- **USDC**: [faucet.circle.com](https://faucet.circle.com/)
- **ETH** (for gas): [alchemy.com/faucets/base-sepolia](https://www.alchemy.com/faucets/base-sepolia)

Your wallet addresses are logged to the console on first startup.

### 4. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Try it

| Prompt | What happens |
|--------|-------------|
| "What is 5 + 3?" | Free tool (`add`) |
| "Get a random number between 1 and 10" | Free tool (`get_random_number`) |
| "Get a premium random number" | Paid tool ($0.01 USDC) |
| "Run a premium analysis on 42" | Paid tool ($0.02 USDC) |
| "Check your budget" | Agent calls `check_budget` |
| "What services are available?" | Agent searches the registry |

## Architecture

```
User --> Chat UI (Next.js) --> /api/chat
                                  |
                      createOrchestrator(getModel())
                                  |
                          ToolLoopAgent (max 10 steps)
                         /      |       |        \
                 MCP Tools  Budget   Discovery  Local Tools
                    |        Tools    Tools     (hello-local)
                    v
              /mcp (MCP Server singleton)
             /          \
       Free Tools    Paid Tools
                        |
                   402 + withPayment()
                        |
                 Coinbase Facilitator
                        |
                  Base Network (USDC)
```

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/chat` | Chat endpoint -- ToolLoopAgent + streaming + payment tracking |
| `GET/POST /mcp` | MCP server -- free and paid tools |
| `POST /api/registry` | Register an x402 service |
| `GET /api/registry` | List registered services |

### Key Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Chat API | `src/app/api/chat/route.ts` | Request handler, agent setup, payment tracking via `onStepFinish` |
| Orchestrator | `src/lib/agents/orchestrator.ts` | `ToolLoopAgent` with budget, discovery, and MCP tools |
| BudgetController | `src/lib/budget-controller.ts` | Per-session $0.50 limit, spend history, telemetry |
| AI Provider | `src/lib/ai-provider.ts` | `getModel()` -- AI Gateway with DeepSeek fallback |
| Registry | `src/lib/registry/` | In-memory service registry + discovery tools |
| Telemetry | `src/lib/telemetry.ts` | Structured JSON payment events |
| Accounts | `src/lib/accounts.ts` | CDP wallet creation, async faucet |
| MCP Server | `src/app/mcp/route.ts` | Paid/free tools with Coinbase facilitator |

### Available Tools

**Free Tools:**
- `add` -- Add two numbers
- `get_random_number` -- Generate a random number
- `hello-remote` -- Receive a greeting (MCP)
- `hello-local` -- Receive a greeting (local)

**Paid Tools:**
- `premium_random` -- Premium random number ($0.01 USDC)
- `premium_analysis` -- AI-powered number analysis ($0.02 USDC)

**Agent Tools:**
- `check_budget` -- Check remaining session budget
- `search_x402_services` -- Search the service registry
- `probe_x402_service` -- Connect to an MCP server and list its tools
- `list_registered_services` -- List all registered services

## Payment Flow

1. Agent calls a paid tool (e.g. `premium_random`)
2. MCP server returns **402 Payment Required** with payment requirements
3. `withPayment()` intercepts the 402
4. Purchaser wallet signs **EIP-3009 authorization** (off-chain, no gas needed)
5. Request retries with `Payment` header
6. Coinbase facilitator verifies signature and submits on-chain USDC transfer
7. Tool executes and returns result + tx hash in `_meta["x402.payment-response"]`
8. `onStepFinish` extracts the tx hash and amount
9. `BudgetController.recordSpend()` logs the payment and emits telemetry

## Deploying to Vercel

### With AI Gateway (recommended)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Link project and enable AI Gateway
vercel link
# Then enable AI Gateway in the Vercel Dashboard for your project

# 3. Pull OIDC credentials locally
vercel env pull
# This provisions VERCEL_OIDC_TOKEN -- no DEEPSEEK_API_KEY needed on Vercel

# 4. Set CDP credentials in Vercel Dashboard
# Settings > Environment Variables:
#   CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
#   NETWORK=base-sepolia (or base for mainnet)
# URL is auto-derived from VERCEL_PROJECT_PRODUCTION_URL -- do not set manually

# 5. Deploy
vercel --prod
```

### Without AI Gateway

Set `DEEPSEEK_API_KEY` in the Vercel Dashboard alongside the CDP credentials. `getModel()` falls back to the direct DeepSeek provider when no OIDC token is present.

## Development

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # TypeScript check
pnpm test         # Run test suite (Vitest)
```

### Build in CI without credentials

`next.config.ts` validates environment variables at build time. To build without CDP credentials:

```bash
CI=true pnpm build                # Skips env require()
SKIP_ENV_VALIDATION=1 pnpm build  # Alternative
```

### Testing

Tests use **Vitest** with Node.js environment. Coverage scoped to `src/lib/**`.

```bash
pnpm test                    # Run all tests
pnpm test -- --coverage      # With V8 coverage report
```

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CDP_API_KEY_ID` | Yes | -- | Coinbase CDP API key ID |
| `CDP_API_KEY_SECRET` | Yes | -- | Coinbase CDP API secret |
| `CDP_WALLET_SECRET` | Yes | -- | Wallet encryption key |
| `DEEPSEEK_API_KEY` | Local dev only | -- | Direct DeepSeek API key |
| `AI_MODEL` | No | `deepseek/deepseek-chat` | Gateway model ID for chat |
| `AI_REASONING_MODEL` | No | `deepseek/deepseek-reasoner` | Gateway model ID for reasoning |
| `NETWORK` | No | `base-sepolia` | `base-sepolia` or `base` |
| `URL` | No | `http://localhost:3000` | Auto-derived on Vercel |
| `VERCEL_OIDC_TOKEN` | Vercel only | -- | Auto-provisioned by `vercel env pull` |

### Networks

| Network | `NETWORK` value | Chain ID | Use case |
|---------|----------------|----------|----------|
| Base Sepolia | `base-sepolia` | 84532 | Development/testing (auto-faucet) |
| Base Mainnet | `base` | 8453 | Production (real USDC) |

### Testnet Faucets

- **USDC**: [faucet.circle.com](https://faucet.circle.com/)
- **ETH**: [alchemy.com/faucets/base-sepolia](https://www.alchemy.com/faucets/base-sepolia)
- **CDP Console**: [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/)

## Known Limitations

- **In-memory registry** -- resets on every serverless cold start; production needs Neon Postgres
- **Advisory budget** -- $0.50 session limit is advisory; `withPayment()` signs regardless (worst case: $1.00 over 10 steps)
- **No registry auth** -- `POST /api/registry` has no authentication (open for demo)
- **No SSRF protection** -- `probe_x402_service` connects to arbitrary URLs without IP filtering
- **Optional env vars** -- CDP credentials are `.optional()` in Zod schema; missing vars crash at runtime, not startup

## Documentation

- [Architecture Design Document](./reports/architecture-design.md) -- detailed system design with mermaid diagrams
- [x402 Protocol](https://x402.org)
- [AI SDK v6](https://ai-sdk.dev)
- [Coinbase CDP](https://docs.cdp.coinbase.com/)
- [MCP Specification](https://modelcontextprotocol.io)

## License

MIT
