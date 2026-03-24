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
