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
