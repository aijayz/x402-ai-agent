# x402 AI Agent - Crypto Payment for AI

![Demo](./public/demo.png)

[x402](https://x402.org) is an HTTP-native protocol for crypto payments that enables AI agents to pay for tools and services autonomously. This project demonstrates integrating x402 payments with an AI agent powered by DeepSeek.

## Overview

This is a full-stack implementation of an AI agent that can discover, authorize, and pay for tools using USDC on Base. The agent automatically handles HTTP 402 Payment Required responses and completes payments without user intervention.

**Demo**: [https://x402-ai-agent.vercel.app](https://x402-ai-agent.vercel.app)

## Features

- **AI Chat Interface**: Streaming chat UI with DeepSeek model
- **Autonomous Payments**: AI agent automatically pays for premium tools
- **MCP Server**: Remote MCP server with free and paid tools
- **Real-time Streaming**: Live streaming responses using AI SDK v6
- **Dual Wallet System**: Purchaser (pays for tools) and Seller (receives payments)
- **Auto-faucet**: Automatic USDC funding on testnet when balance is low

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **AI**: [AI SDK](https://ai-sdk.dev) + [DeepSeek](https://platform.deepseek.com/)
- **Payments**: [x402 Protocol](https://x402.org) + [Coinbase CDP](https://docs.cdp.coinbase.com/)
- **MCP**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **Styling**: Tailwind CSS + shadcn/ui

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│  Chat UI    │────▶│  /api/chat  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                   ┌─────────────┐              │
                   │ MCP Server │◀──────────────┘
                   │  /mcp      │
                   └─────┬───────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
    │ Free Tool │  │Paid Tool  │  │Facilitator│
    │           │  │           │  │ (Coinbase)│
    └───────────┘  └─────┬─────┘  └─────┬─────┘
                         │              │
                    ┌────▼─────┐   ┌────▼─────┐
                    │ 402 +    │   │On-chain  │
                    │ Payment  │   │Settlement│
                    └──────────┘   └──────────┘
```

### Key Components

| Component | File | Description |
|-----------|------|-------------|
| Chat API | `src/app/api/chat/route.ts` | Receives messages, creates MCP client, streams responses |
| MCP Server | `src/app/mcp/route.ts` | Remote MCP server with free and paid tools |
| Wallet Manager | `src/lib/accounts.ts` | CDP-managed wallets for payment operations |
| Payment Wrapper | `src/lib/payment.ts` | Handles 402 responses with `withPayment()` |

### Available Tools

**Free Tools:**
- `add` - Add two numbers
- `get_random_number` - Generate a random number

**Paid Tools:**
- `premium_random` - Premium random number ($0.01 USDC)
- `premium_analysis` - Premium analysis ($0.02 USDC)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Coinbase CDP credentials
- DeepSeek API key

### Installation

```bash
git clone https://github.com/aijayz/crypto-pay-agent
cd crypto-pay-agent
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
# CDP Credentials (required for payment operations)
CDP_API_KEY_ID=your_key_id
CDP_API_KEY_SECRET=your_secret
CDP_WALLET_SECRET=your_wallet_secret

# DeepSeek API (required for AI)
DEEPSEEK_API_KEY=your_deepseek_key

# Network Configuration
NETWORK=base-sepolia
URL=http://localhost:3000
```

### Running Locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

### Test Prompts

- "What is 5 + 3?" (free tool)
- "Get a random number between 1 and 10" (free tool)
- "Get a premium random number between 1 and 100" (paid $0.01)
- "Check my USDC balance"

## Payment Flow

1. **Request**: User prompts AI to use a premium tool
2. **402 Response**: MCP server returns 402 Payment Required with payment requirements
3. **Auto-Payment**: `withPayment()` wrapper intercepts the 402, signs EIP-3009 authorization
4. **Settlement**: Coinbase facilitator verifies and settles on-chain
5. **Result**: Tool executes and returns result to AI

## Network Configuration

| Network | Chain ID | Use Case |
|---------|----------|----------|
| Base Sepolia | 84532 | Development/testing |
| Base | 8453 | Production |

### Getting Testnet Funds

- **USDC**: https://faucet.circle.com/
- **ETH**: https://www.alchemy.com/faucets/base-sepolia
- **CDP Console**: https://portal.cdp.coinbase.com/

## Documentation

- [x402 Protocol](https://x402.org)
- [MCP Specification](https://modelcontextprotocol.io)
- [Coinbase CDP](https://docs.cdp.coinbase.com/)
- [DeepSeek API](https://platform.deepseek.com/)

## License

MIT