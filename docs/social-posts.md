# Obol AI Social Posts

---

## X Thread — Product Introduction

**Tweet 1 (Hook)**

What if your AI agent had a wallet?

We built an AI that autonomously pays for crypto intelligence with USDC — no subscriptions, no API keys.

Meet Obol AI. Here's how it works ->

**Tweet 2 (The Problem)**

Most AI tools give you recycled free data or lock everything behind $200/mo subscriptions.

The data that matters — whale flows, rug pull detection, smart money tracking — lives behind paywalls.

What if the AI just... paid for it?

**Tweet 3 (How It Works)**

Obol uses the x402 protocol — HTTP 402 ("Payment Required") finally has a purpose.

When the AI needs data, it sends USDC micropayments on Base. Fractions of a cent per call.

No API keys. No accounts. Just HTTP + money.

**Tweet 4 (What It Can Do)**

Ask Obol anything about crypto. It decides what to buy:

- DeFi safety scan — rug pull + honeypot detection ($0.05)
- Whale tracking — smart money flows in real-time ($0.02)
- Token alpha screening — unlocks + allocations ($0.33)
- Social sentiment — narrative analysis ($0.17)
- Contract audit — verified source + AI analysis ($0.03)

**Tweet 5 (The Agent Economy Angle)**

This is what the agent economy actually looks like:

AI agent discovers a service -> pays USDC -> gets data -> cross-references 3-4 sources -> delivers analysis.

No human in the loop for payments. The agent has spending authority.

**Tweet 6 (Try It Free)**

You get 2 free research calls to try it. Connect a wallet for more free credits (up to $0.50 based on wallet age).

Then top up with USDC from Base, Ethereum, Arbitrum, or Optimism.

Try it: obolai.xyz

Open source: github.com/aijayz/x402-ai-agent

**Tweet 7 (Tech Stack)**

Built with:
- x402 protocol — HTTP-native USDC payments
- Coinbase CDP wallets — house wallet for payment ops
- AI SDK v6 — streaming agent with tool calling
- MCP — standardized AI tool integration
- Neon Postgres + Upstash Redis
- Deployed on Vercel

#x402 #AI #Web3 #Base #AgentEconomy

---

## X Article — Why AI Agents Need Wallets

Copy-paste the text below directly into X's article editor (x.com > Write > Write article).
Use X's formatting toolbar for headers (H1/H2) and bold where indicated.

--- BEGIN ARTICLE (copy from next line) ---

[H1] The Missing Piece in AI: Agents That Can Spend Money

[Subtitle] Why we built an AI research agent that pays for its own intelligence — and what it tells us about the future of the internet.


There's a question nobody in AI is asking:

If AI agents are supposed to be autonomous, why can't they pay for anything?

We've built agents that can write code, search the web, book flights, and draft legal contracts. But the moment an agent needs paid data — a premium API, a proprietary dataset, a licensed service — it hits a wall. Someone has to set up an API key, manage a subscription, and hope the billing doesn't spiral.

That's the problem we set out to solve with Obol AI.


[H2] The real problem: intelligence costs money

Here's what most people don't realize about crypto research. The free data everyone relies on — CoinGecko prices, Etherscan lookups, Twitter sentiment — is table stakes. It's what every other bot, dashboard, and AI already has.

The data that actually matters is behind paywalls:

Real-time whale flow analysis from proprietary on-chain indexers. Smart money tracking across DEXs and bridges. Contract security audits from specialized scanning engines. Token allocation and unlock schedules from institutional data providers. Social narrative analysis across crypto-native platforms.

Each of these services charges differently. Some have monthly subscriptions. Some have per-request pricing. Some require enterprise agreements. For a human researcher, managing all of this is a full-time job. For an AI agent, it's impossible — until now.


[H2] What x402 changes

HTTP has always had a status code for payments: 402 Payment Required. It was reserved "for future use" in 1997. Almost 30 years later, the x402 protocol finally makes it real.

Here's how it works:

An AI agent sends a normal HTTP request to a data service. The service responds with 402 and a payment requirement — say, $0.03 in USDC. The agent signs a USDC authorization on Base. The request is retried with the payment proof in the header. The service verifies payment and returns the data.

No API keys. No OAuth flows. No subscription management. Just HTTP requests with money attached.

This is what makes Obol possible. When you ask Obol a question like "Is this token safe to buy?", it doesn't just give you a ChatGPT-style summary from training data. It goes out and buys real-time intelligence:

It calls a contract audit service ($0.03) to check for honeypot traps, malicious functions, and proxy patterns. It queries a token security scanner ($0.001) to verify liquidity locks, ownership, and mint functions. It pulls allocation data from Messari ($0.25) for insider vesting schedules and unlock cliffs. It cross-references on-chain data from Dune Analytics for smart money flows and whale accumulation.

Total cost: about $0.30. For analysis that would take a human researcher an hour and cost $50+ in subscription fees across multiple platforms.


[H2] Why this matters beyond crypto

Obol is a crypto research agent, but the pattern it demonstrates is universal.

Right now, the AI industry is stuck in a weird place. We have incredibly capable models, but they're limited to free data and pre-authorized APIs. Every integration requires a human to set up credentials, manage billing, and maintain the connection.

x402 flips this. It turns every web service into something an AI agent can discover and pay for on the fly. No setup. No contracts. No billing disputes.

Imagine this applied beyond crypto:

A legal AI agent that pays per-query for case law databases. A medical AI that buys real-time drug interaction data from licensed providers. A financial AI that purchases premium market data only when the question demands it. A recruiting AI that pays for verified credential checks on demand.

In all of these cases, the value proposition is the same: the agent spends cents to save the user hours, and it only pays for what it actually needs.


[H2] The economics of pay-per-intelligence

There's something counterintuitive about Obol's pricing that we think is important.

A typical crypto research subscription costs $50-500/month. You pay whether you use it or not. Most users check a few tokens, look at some charts, and move on. They're paying for the 5% they use.

Obol charges $0.02-$0.33 per research query. A heavy user running 20 deep research queries a day would spend about $3-5/day. A casual user checking one or two tokens spends under $0.50.

This is only possible because x402 enables true micropayments. When the cost of a transaction is essentially zero (USDC on Base), you can charge what the data is actually worth — fractions of a cent for a price check, a quarter for a deep allocation analysis.

The agent handles all of this transparently. You see what it bought, what it paid, and what it found. No hidden costs, no surprise bills.


[H2] What we learned building this

A few things surprised us.

[Bold] Agents need spending authority, not just tools. [End bold] The biggest unlock wasn't giving the AI access to paid services — it was giving it permission to spend money without asking. Obol's orchestrator has a system prompt that says "never ask the user if you should proceed with a paid tool call." It checks the budget, decides if the cost is justified, and acts. This is what makes it feel like a real research assistant instead of a chatbot with a confirmation dialog.

[Bold] Cross-referencing is where the value compounds. [End bold] Any single data source can be wrong or incomplete. Obol's research clusters combine 3-4 services per query and cross-reference the results. A contract audit alone might miss a social engineering attack. Combined with social sentiment and whale flow data, the picture becomes much clearer.

[Bold] Micropayments change service economics. [End bold] When services can charge per-request, they can serve a much larger market. A whale tracking service that charges $100/month might have 500 customers. The same service charging $0.002/request through x402 can serve every AI agent on the internet. The total revenue potential is much larger.


[H2] Try it yourself

Obol gives you 2 free research calls — no wallet needed. Connect a wallet (with some history) to claim up to $0.50 in free credits. After that, top up with USDC from Base, Ethereum, Arbitrum, or Optimism.

The entire codebase is open source. If you're building AI agents and want to see how x402 payments work in practice, the repo is the best documentation we can offer.

obolai.xyz
github.com/aijayz/x402-ai-agent

We think agents that can spend money will be as transformative as agents that can use tools. Obol is our proof of concept. We'd love to hear what you think.

--- END ARTICLE ---

---

## LinkedIn Version

We built an AI agent that pays for its own intelligence — here's why that matters.

Most AI tools today either rely on free public data or require users to manage API keys and subscriptions. We wanted to explore a different model: what if the AI agent itself could autonomously pay for the information it needs?

That's what we built with Obol AI.

Obol is a crypto research agent powered by the x402 protocol — an open standard for HTTP-native micropayments using USDC. When a user asks a question, the agent decides which intelligence services to query, pays for them in real-time, and cross-references the results to deliver a comprehensive analysis.

This covers DeFi safety scoring, whale tracking, social sentiment, token security audits, and multi-chain contract analysis across Ethereum, Base, Arbitrum, and Optimism.

What makes this interesting from an infrastructure perspective:

- No API keys or subscriptions — services are paid per request, exactly like how you'd pay for a coffee
- The agent has spending authority — it decides what's worth buying based on the user's balance and the question asked
- Multi-chain by default — users deposit USDC from any major EVM chain, and the agent routes queries to the correct chain automatically

We think this is a small preview of what the agent economy will look like — AI systems that can discover, evaluate, and pay for services autonomously. x402 is the plumbing that makes it work.

If you're interested in the intersection of AI agents and crypto payments, I'd love to hear your thoughts.

Try it at obolai.xyz

---

## Farcaster Version

Built something weird: an AI agent with a USDC wallet on Base.

Ask it a crypto question. It autonomously decides what intelligence to buy, pays for it with micropayments (x402 protocol), and cross-references multiple sources.

DeFi safety check = $0.05
Whale tracking = $0.02
Full token alpha screen = $0.33

No subscriptions. No API keys. Just an agent that spends cents to save you hours.

2 free calls to try it. Connect wallet for more.

obolai.xyz

Built on Base. Open source: github.com/aijayz/x402-ai-agent
