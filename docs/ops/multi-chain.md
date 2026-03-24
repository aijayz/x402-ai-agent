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
