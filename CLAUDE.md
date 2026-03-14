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

This is an x402 AI Agent demonstrating HTTP-based crypto payments integrated with AI capabilities. The app combines:
- **x402 protocol**: HTTP-native payments for APIs and tools
- **MCP (Model Context Protocol)**: AI tool integration with paid tools support
- **AI SDK v6**: Chat interface with streaming responses
- **DeepSeek**: AI model provider
- **CDP Wallets**: Coinbase-managed wallets for payment operations

### Key Architecture Patterns

**MCP Integration** (`src/app/mcp/route.ts`)
- Implements a remote MCP server with `paidTool()` and `tool()` helpers
- Free tools: `add`, `get_random_number`, `hello-remote`
- Paid tools: `premium_random` ($0.01), `premium_analysis` ($0.02)
- Uses `createPaidMcpHandler` from `x402-mcp` with Coinbase facilitator
- The chat endpoint connects as an MCP client with `withPayment()` wrapper

**Chat API** (`src/app/api/chat/route.ts`)
- Receives messages from frontend
- Creates MCP client with payment capabilities
- Calls DeepSeek AI model with available tools
- Streams responses back to UI
- Handles 402 payment responses automatically via `withPayment()`

**Wallet Management** (`src/lib/accounts.ts`)
- **CDP-Managed Only** - Uses Coinbase Developer Platform
- `getOrCreatePurchaserAccount()`: Wallet that pays for tools ($0.10 max per call)
- `getOrCreateSellerAccount()`: Wallet that receives payments
- Auto-faucet on testnet when balance < $0.50
- Requires `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`

**Payment Middleware** (`src/middleware.ts`)
- Currently **disabled** (pass-through mode)
- MCP server handles its own payment via `createPaidMcpHandler`
- Client handles 402 responses via `withPayment()` wrapper

**Environment** (`src/lib/env.ts`)
Uses `@t3-oss/env-nextjs` for validated environment config:
- CDP: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- AI: `DEEPSEEK_API_KEY`
- Network: `NETWORK` (base-sepolia|base), `URL`

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/chat` | AI chat endpoint with MCP client, processes paid tools |
| `/mcp` | MCP server with paid/unpaid tools |

### AI Components

UI components in `src/components/ai-elements/` are built for the AI SDK's streaming responses:
- `conversation.tsx` - Container with scroll behavior
- `message.tsx` - Individual message display
- `tool.tsx` - Tool call rendering with payment status
- `prompt-input.tsx` - Chat input with model selection
- `response.tsx` - AI response display
- `reasoning.tsx` - DeepSeek reasoner thought display
- `loader.tsx` - Loading indicator
- `suggestion.tsx` - Quick suggestion buttons
- `code-block.tsx` - Syntax highlighted code blocks

Components use `ai` SDK v6 streaming patterns and handle real-time updates.

## Network Configuration

### Supported EVM Networks
- `base-sepolia` (default) - Base testnet, uses USDC faucet for testing
- `base` - Base mainnet, requires real USDC

Network IDs follow x402 CAIP-2 format:
- `eip155:84532` (Base Sepolia)
- `eip155:8453` (Base)

## Environment Setup

Copy `.env.example` to `.env.local`:

```bash
# CDP Credentials (required for payment operations)
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...

# DeepSeek API (required for AI)
DEEPSEEK_API_KEY=...

# Network Configuration
NETWORK=base-sepolia
URL=http://localhost:3000
```

## Payment Flow

1. User requests a paid tool (e.g., "Get premium random number")
2. AI calls the tool without payment authorization
3. MCP server returns 402 Payment Required with payment requirements
4. `withPayment()` wrapper intercepts the 402 response
5. Purchaser wallet signs EIP-3009 authorization
6. Request retries with Payment header
7. Coinbase facilitator verifies and settles on-chain
8. USDC transfers from Purchaser to Seller wallet
9. Tool executes and returns result

## Testnet Resources

- Base Sepolia USDC: https://faucet.circle.com/
- Base Sepolia ETH: https://www.alchemy.com/faucets/base-sepolia
- CDP Console: https://portal.cdp.coinbase.com/

## Current Wallet Addresses (CDP-Managed)

| Wallet | Purpose |
|--------|---------|
| `0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e` | Purchaser (pays for tools) |
| `0x545442553E692D0900005d7e48885684Daa0C4f0` | Seller (receives payments) |