# Obol AI - Project Memory

## Project Identity

**Product name:** Obol AI (renamed from x402 AI Agent on 2026-03-22)
**URL:** https://obolai.vercel.app
**Vercel project:** `prj_EmIK8e1f3Rxp4bLcabzRWds6Df3h`
**Icon:** V9 strike-through O with blue→purple gradient (`public/icon.svg`)
**Note:** Obol Network (DeFi DVT protocol) exists — using "Obol AI" to differentiate. User sees SEO overlap as helpful for discovery.

## Business Direction

**Chosen model:** "Practical Hybrid" — AI chat + x402 service orchestration. Revenue = 30% margin on tool calls.

### Phased Plan
1. **Phase 1 (current):** Credit system + chat UI + x402 service orchestration + cost transparency
2. **Phase 2 (3-6mo):** Multi-chain deposits, Bazaar integration, external MCP routing, Bitrefill/Laso
3. **Phase 3 (6-12mo):** Open agent registry/marketplace with reputation system

Full analysis: `docs/superpowers/specs/2026-03-19-x402-business-model-analysis.md`

## Phase 1 Status (2026-03-22) — One Step Left

### Remaining: switch `NETWORK=base` + `NEXT_PUBLIC_NETWORK=base` on Vercel and redeploy

### What's shipped
- 9 service adapters (5 original + 4 QuantumShield) with real/stub registry
- 4 research cluster tools (each orchestrates 3 independent services)
- All 6 service URLs discovered and configured on Vercel
- Credit system: 2 free anon calls → wallet connect with wallet-age Sybil guard → USDC top-up
- Sybil guard via Basescan (free) — tiered credits based on wallet age (<7d/$0.10, 7-30d/$0.25, >30d/$0.50)
- Model fallback with cached probes (5-min TTL, auto-recovery on stream errors)
- Landing page + chat at `/chat`, Obol AI branding + icon
- Rate limiting (Upstash Redis), MetaMask mobile deep link
- Sweep script (`scripts/sweep.ts`) for CDP wallet → cold wallet transfers
- Top-up flow tested and working, URL env var confirmed working

## x402 Service URLs

| Service | URL | Cost |
|---------|-----|------|
| RugMunch | `cryptorugmunch.app` | $0.02–$2.00 |
| Augur | `augurrisk.com` | $0.10 |
| DiamondClaws | `diamondclaws.io` | $0.001 |
| WalletIQ | `walletiq-zeta.vercel.app` | $0.005 |
| GenVox | `api.genvox.io` | $0.03 |
| QuantumShield | `quantumshield-api.vercel.app` | $0.001–$0.003 |

## Key Technical Notes

- `@t3-oss/env-nextjs` inlines env vars at **build time** — Vercel env changes require redeploy
- AI_MODEL on Vercel: `deepseek/deepseek-chat` (Google free tier = 20 req/day)
- DeepSeek unreachable from dev machine (Netskope corporate firewall)
- RugMunch endpoint `/api/agent/v1/scan` inferred from status URL — not verified (firewall)
- 402 flow: first call → 402 error (isError in output), AI retries, second call succeeds with payment
- Step limit: 12 (each paid tool = 2 steps: 402 + retry)

## User Preferences

- Don't deploy to Vercel on every small change — commit/push, deploy when ready
- Prefers option 2 (scripts) over option 1 (API endpoints) for admin operations
- Chose Basescan (free) over WalletIQ ($0.005) for Sybil guard — scalability matters
- Concise communication, no unnecessary explanations
