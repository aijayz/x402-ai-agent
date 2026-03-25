# Analytics Setup (PostHog)

PostHog tracks the user conversion funnel from landing page visit through to USDC deposit.

## Events Tracked

| Event | Trigger | Properties |
|-------|---------|------------|
| `$pageview` | Auto — page load | url, referrer |
| `chat_started` | First message in a session | `source`: input \| suggestion |
| `wallet_connected` | Successful MetaMask connect | — |
| `credits_claimed` | Free credits granted | `amountUsdc` |
| `topup_started` | Top-up sheet opened | — |
| `topup_completed` | USDC deposit confirmed | `amountUsdc`, `chain` |

Users are identified by wallet address. Anonymous visitors get an auto-generated distinct ID until they connect.

## Setup

1. Create a project at https://us.posthog.com (free tier: 1M events/month)
2. Copy the **Project API Key** from Settings > Project API Key
3. Set env vars on Vercel:

```bash
# PostHog project key (required)
vercel env add NEXT_PUBLIC_POSTHOG_KEY production
# paste: phc_xxxxxxxxxxxxx

# PostHog ingest host (optional, defaults to https://us.i.posthog.com)
vercel env add NEXT_PUBLIC_POSTHOG_HOST production
# paste: https://us.i.posthog.com  (US) or https://eu.i.posthog.com (EU)
```

4. Redeploy (env is inlined at build time):

```bash
vercel --prod --yes
```

## Verification

After deploy, visit the site and send a chat message. In PostHog:
- Live Events should show `$pageview` and `chat_started`
- Connect a wallet to see `wallet_connected` and `credits_claimed`

## Funnel Configuration

In PostHog, create a Funnel insight with these steps in order:
1. `$pageview` (filter: path = `/chat`)
2. `chat_started`
3. `wallet_connected`
4. `credits_claimed`
5. `topup_started`
6. `topup_completed`

## Notes

- PostHog gracefully no-ops when `NEXT_PUBLIC_POSTHOG_KEY` is not set
- `autocapture` is disabled — only custom events above are tracked
- `person_profiles` set to `identified_only` to minimize storage
- Client-side only (posthog-js) — no server-side SDK needed
