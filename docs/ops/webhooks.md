# Alchemy Webhook Setup

Each supported chain needs an Alchemy "Address Activity" webhook watching
the purchaser wallet for USDC transfers.

## Purchaser Wallet

Your CDP Purchaser wallet address (set via `DEPOSIT_ADDRESS` env var)

## Webhook Endpoints

| Chain    | Endpoint URL                              | Env Var                        |
|----------|-------------------------------------------|--------------------------------|
| Base     | `https://your-domain.com/api/credits/webhook`  | `ALCHEMY_WEBHOOK_KEY_BASE`     |
| Ethereum | `https://your-domain.com/api/credits/webhook/ethereum` | `ALCHEMY_WEBHOOK_KEY_ETHEREUM` |
| Arbitrum | `https://your-domain.com/api/credits/webhook/arbitrum` | `ALCHEMY_WEBHOOK_KEY_ARBITRUM` |
| Optimism | `https://your-domain.com/api/credits/webhook/optimism` | `ALCHEMY_WEBHOOK_KEY_OPTIMISM` |

## Setup Steps (per chain)

1. Go to Alchemy Dashboard > Notify > Create Webhook
2. Select chain network (e.g., ETH Mainnet)
3. Webhook type: Address Activity
4. Address: your `DEPOSIT_ADDRESS` (CDP Purchaser wallet)
5. Set the webhook URL from the table above
6. Copy the signing key and set the corresponding env var on Vercel

## Testing

Send a small USDC amount to the purchaser address on the target chain.
Check Vercel function logs for `[WEBHOOK:ethereum]` entries.

## Env Vars

Set all four `ALCHEMY_WEBHOOK_KEY_*` vars on Vercel after creating each webhook.
A redeploy is required since env vars are inlined at build time.
