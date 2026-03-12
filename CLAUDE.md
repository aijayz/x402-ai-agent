# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start development server with Turbopack
pnpm build            # Build for production with Turbopack
pnpm start            # Start production server
pnpm typecheck        # Run TypeScript type checking (no emit)
```

## Architecture Overview

This is an x402 AI Starter Kit demonstrating HTTP-based payments integrated with AI capabilities. The app combines:
- **x402 protocol**: HTTP-native payments for APIs and content
- **MCP (Model Context Protocol)**: AI tool integration with paid tools support
- **AI SDK**: Chat interface with streaming responses
- **Multi-chain wallets**: EVM (Base, Ethereum) and Solana support

### Key Architecture Patterns

**Payment Middleware** (`src/middleware.ts`)
- Uses `x402-next` payment middleware for paywalled routes
- API routes (`/api/*`) require payment from all callers
- Page routes only require payment from bots/scraper user agents
- Routes config specifies price and network per path
- Currently uses CDP-managed seller account; supports multi-chain via configuration

**MCP Integration** (`src/app/mcp/route.ts`)
- Implements a remote MCP server with `paidTool()` and `tool()` helpers
- Paid tools require USDC payment before execution
- Uses `createPaidMcpHandler` from `x402-mcp` with facilitator for settlement
- The chat endpoint connects as an MCP client with `withPayment()` wrapper

**Wallet Management**
Two wallet systems exist:

1. **CDP-Managed** (`src/lib/accounts.ts`) - Original implementation
   - `getOrCreatePurchaserAccount()`: Wallet that pays for tools/APIs
   - `getOrCreateSellerAccount()`: Wallet that receives payments
   - Auto-faucet on testnet when balance < $0.50
   - Requires `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`

2. **Self-Managed Multi-Chain** (`src/lib/wallets/`, `src/lib/payment-client.ts`)
   - `getEvmWallet()`: EVM wallet from `EVM_PRIVATE_KEY`
   - `getSolanaWallet()`: Solana wallet from `SVM_PRIVATE_KEY` (base58)
   - `createMultiChainPaymentClient()`: Unified client for both chains
   - Supports Base Sepolia, Base mainnet, Ethereum, Solana devnet/mainnet

**Environment** (`src/lib/env.ts`)
Uses `@t3-oss/env-nextjs` for validated environment config:
- Self-managed: `EVM_PRIVATE_KEY`, `EVM_NETWORK`, `SVM_PRIVATE_KEY`, `SOLANA_NETWORK`
- CDP (optional): `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- Base: `NETWORK` (base-sepolia|base), `URL`

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/chat` | AI chat endpoint with MCP client, processes paid tools |
| `/api/add` | Example paywalled API ($0.005) - adds two numbers |
| `/api/bot` | SSE streaming agent that can pay for content/APIs |
| `/mcp` | MCP server with paid/unpaid tools |

### AI Components

UI components in `src/components/ai-elements/` are built for the AI SDK's streaming responses:
- `conversation.tsx` - Container with scroll behavior
- `message.tsx` - Individual message display
- `tool.tsx` - Tool call rendering with payment verification UI
- `prompt-input.tsx` - Chat input with model selection

Components use `ai` SDK's streaming patterns and are designed to handle real-time updates.

## Network Configuration

### EVM Networks
- `base-sepolia` (default) - Base testnet, uses USDC faucet for testing
- `base` - Base mainnet, requires real USDC
- `ethereum` - Ethereum mainnet

### Solana Networks
- `devnet` (default) - Solana devnet for testing
- `mainnet` - Solana mainnet

Network IDs follow x402 CAIP-2 format:
- EVM: `eip155:84532` (Base Sepolia), `eip155:8453` (Base)
- Solana: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet)

## Environment Setup

Copy `.env.example` to `.env.local`. Choose wallet strategy:

**Self-managed wallets (recommended for multi-chain):**
```bash
# EVM (Base, Ethereum)
EVM_PRIVATE_KEY=0x...
EVM_NETWORK=base-sepolia

# Solana
SVM_PRIVATE_KEY=base58encodedkey
SOLANA_NETWORK=devnet

NETWORK=base-sepolia
URL=http://localhost:3000
```

**CDP-managed wallets:**
```bash
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...
NETWORK=base-sepolia
URL=http://localhost:3000
```

For AI model access, configure AI Gateway (`vc link && vc env pull`) or another AI SDK provider.

## Important Implementation Notes

1. **Payment Flow**: When AI calls a paid tool, `withPayment()` intercepts the 402 response, signs a payment transaction, and retries the request automatically.

2. **Middleware Pattern**: The x402 middleware runs at the edge - API routes always require payment, pages only for bots. Bot detection uses User-Agent regex matching.

3. **Wallet Compatibility**: The codebase currently uses CDP accounts in middleware and MCP route, while the multi-chain wallet module (`src/lib/wallets/`) is available for self-managed key support. Integration is ongoing.

4. **Testnet Faucets**:
   - Base Sepolia USDC: https://faucet.circle.com/
   - Base Sepolia ETH: https://www.alchemy.com/faucets/base-sepolia
   - Solana Devnet: `solana airdrop 2` for SOL, Circle faucet for USDC
