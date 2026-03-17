---
marp: true
theme: default
paginate: true
backgroundColor: "#ffffff"
color: "#1a1a1a"
style: |
  section {
    font-family: 'DejaVu Sans', 'Segoe UI', -apple-system, sans-serif;
    background: #ffffff;
    padding: 40px 50px;
  }
  section > div:has(pre) {
    display: flex;
    justify-content: center;
  }
  section pre {
    font-size: 0.7em;
    line-height: 1.2;
    margin: 0.3em 0;
  }
  h1 {
    color: #0066ff;
    font-weight: 700;
    text-align: center;
    font-size: 2em;
    margin-bottom: 0.5em;
  }
  h2 {
    color: #1a1a1a;
    border-bottom: 3px solid #0066ff;
    padding-bottom: 0.2em;
    font-size: 1.4em;
  }
  h3 {
    color: #0066ff;
    font-size: 1.1em;
    margin: 0.5em 0 0.3em 0;
  }
  strong {
    color: #0066ff;
  }
  code {
    background: #f8f8f8;
    color: #1a1a1a;
    padding: 0.1em 0.3em;
    border-radius: 4px;
    font-size: 0.85em;
    border: 1px solid #0066ff;
  }
  pre {
    background: #f8f8f8 !important;
    color: #1a1a1a !important;
    border: 2px solid #0066ff;
    border-radius: 6px;
    padding: 0.6em;
    font-size: 0.7em;
    line-height: 1.35;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  pre code {
    background: transparent !important;
    color: #1a1a1a !important;
    font-size: 1em;
    border: none;
  }
  /* Syntax highlighting - Tech Innovation light palette */
  pre .hljs-attr, pre .hljs-string { color: #0066cc; }
  pre .hljs-number { color: #0066ff; }
  pre .hljs-literal { color: #0066cc; }
  pre .hljs-keyword { color: #0044aa; }
  pre .hljs-comment { color: #6a6a6a; }
  pre .hljs-function { color: #0055dd; }
  pre .hljs-built_in { color: #0066ff; }
  pre .hljs-variable { color: #333333; }
  pre .hljs-title { color: #0055dd; }
  pre .hljs-params { color: #333333; }
  pre .hljs-punctuation { color: #333333; }
  table {
    border-collapse: collapse;
    width: fit-content;
    margin: 0.5em auto;
    font-size: 0.85em;
    border: 2px solid #0066ff;
  }
  th {
    background: #0066ff;
    color: #ffffff;
    padding: 0.6em 0.8em;
    border: none;
    border-bottom: 2px solid #0066ff;
    font-weight: 600;
    text-align: left;
    font-size: 0.95em;
  }
  td {
    border: none;
    border-bottom: 1px solid #e0e0e0;
    padding: 0.5em 0.8em;
    color: #1a1a1a;
    background: transparent;
  }
  tr:last-child td {
    border-bottom: none;
  }
  tbody tr:nth-child(even) td {
    background: #f5f5f5;
  }
  tbody tr:nth-child(odd) td {
    background: #ffffff;
  }
  table + p {
    text-align: center;
    margin-top: 0.5em;
  }
  a {
    color: #0066ff;
  }
  ul, ol {
    color: #1a1a1a;
    margin: 0.3em 0;
    padding-left: 1.5em;
  }
  li {
    margin: 0.25em 0;
    font-size: 0.95em;
  }
  p {
    margin: 0.4em 0;
  }
  section img {
    display: block !important;
    margin: 0 auto !important;
  }
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Building AI Agents with x402 Crypto Payments

## A Workshop on Monetizing AI with HTTP-Native Payments

---

# Agenda

1. **The Problem**: Why AI agents need payments
2. **x402 Protocol**: HTTP-native crypto payments
3. **Architecture**: ToolLoopAgent + budget + service discovery
4. **Implementation**: Step-by-step code walkthrough
5. **Budget & Telemetry**: Spend limits and audit trails
6. **Best Practices**: Security, UX, and reliability
7. **Live Demo**: See it in action

---

<!-- _class: lead -->

# Part 1: The Problem

## Why AI Agents Need Native Payment Capabilities

---

# The Rise of AI Agents

AI agents are becoming autonomous actors in the digital world:

- **Tool-calling agents** that execute actions on behalf of users
- **Autonomous workflows** that make decisions and take actions
- **MCP (Model Context Protocol)** enabling standardized tool access

**But there's a gap...**

---

# The Payment Gap

<img src="diagrams/payment-gap.svg" width="70%" style="display:block;margin:0 auto;">

**Current solutions require:**
- Pre-paid subscriptions
- Credit cards on file
- Manual intervention

**Breaking the autonomous flow**

---

# What We Need

An AI agent should be able to:

1. **Discover** available services and their prices
2. **Budget** -- decide if a tool call is worth the cost
3. **Pay** autonomously without human intervention
4. **Track** spending with an audit trail

All in a single HTTP transaction.

---

<!-- _class: lead -->

# Part 2: x402 Protocol

## HTTP-Native Crypto Payments

---

# What is x402?

x402 is a protocol that enables **payments over HTTP**:

<div style="text-align: center;">
  <img src="diagrams/x402-sequence.svg" width="550">
</div>

---

# The 402 Status Code

HTTP defined `402 Payment Required` in 1992 -- x402 brings it to life!

```json
// HTTP/1.1 402 Payment Required
{
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "maxAmountRequired": "10000",
    "resource": "/api/premium",
    "description": "Premium API access"
  }]
}
```

---

# Payment Authorization (EIP-3009)

For EVM chains, x402 uses **EIP-3009** -- transfer with authorization:

```typescript
{
  // Authorize USDC transfer without gas
  signature: "0x...",
  from: purchaserWallet,
  to: sellerWallet,
  value: 10000,  // $0.01 USDC (6 decimals)
  validAfter: timestamp,
  validBefore: timestamp + 1hour,
  nonce: randomBytes32
}
```

**No gas fees for the payer!**

---

# Why x402 for AI Agents?

| Feature | Benefit for AI Agents |
|---------|----------------------|
| HTTP-native | Works with any HTTP client |
| Stateless | No session management needed |
| Instant settlement | Real-time payment verification |
| Micropayments | Pay $0.01 or less efficiently |
| Multi-chain | USDC on Base (Sepolia / Mainnet) |

---

<!-- _class: lead -->

# Part 3: Architecture

## ToolLoopAgent + Budget + Service Discovery

---

# High-Level Architecture

<img src="diagrams/architecture.svg" width="95%">

---

# Key Components

### 1. ToolLoopAgent (Orchestrator)
- AI SDK v6 multi-step agent with `stopWhen: stepCountIs(10)`
- Combines MCP tools, budget tools, and discovery tools

### 2. BudgetController
- Per-session $0.50 USDC advisory limit
- Tracks every payment with tx hashes
- Emits structured JSON telemetry

### 3. Service Discovery Registry
- In-memory registry of x402-enabled services
- Agent tools: `search`, `probe`, `list`

---

# Payment Flow

<img src="diagrams/payment-sequence.svg" width="95%">

**Result**: tool output + tx hash returned to agent -> `BudgetController.recordSpend()` -> telemetry event

---

# Wallet Architecture

### Purchaser Wallet (pays for tools)
- CDP-managed -- private keys never exposed
- Async faucet on `base-sepolia` (non-blocking)
- Max $0.10 per tool call (`withPayment` hard cap)

### Seller Wallet (receives payments)
- CDP-managed, configured on MCP server
- Payments settled via Coinbase facilitator

### Facilitator
- Validates EIP-3009 signatures
- Pays gas on behalf of purchaser
- Settles USDC transfers on-chain

---

<!-- _class: lead -->

# Part 4: Implementation

## Building an x402-Powered AI Agent

---

# Project Setup

```bash
git clone https://github.com/aijayz/x402-ai-agent
cd x402-ai-agent
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your CDP + DeepSeek credentials
```

---

# Environment Configuration

```bash
# .env.local

# CDP Credentials (required -- wallets won't work without these)
CDP_API_KEY_ID=your_key_id
CDP_API_KEY_SECRET=your_secret
CDP_WALLET_SECRET=your_wallet_secret

# AI Provider (local dev -- not needed with AI Gateway on Vercel)
DEEPSEEK_API_KEY=your_key

# AI Model IDs (gateway format: provider/model)
AI_MODEL=deepseek/deepseek-chat
AI_REASONING_MODEL=deepseek/deepseek-reasoner

# Network
NETWORK=base-sepolia
URL=http://localhost:3000
```

---

# MCP Server with Paid Tools

```typescript
// src/app/mcp/route.ts -- handler is a module-level singleton
let handler = null;
async function getHandler() {
  if (!handler) {
    const sellerAccount = await getOrCreateSellerAccount();
    handler = createPaidMcpHandler((server) => {
      // Free tool -- 4 params: (name, description, schema, handler)
      server.tool("add", "Add two numbers",
        { a: z.number().int(), b: z.number().int() },
        async (args) => ({ content: [{ type: "text", text: String(args.a + args.b) }] }));

      // Paid tool -- 6 params: (name, description, {price}, schema, {}, handler)
      server.paidTool("premium_random", "Premium random number",
        { price: 0.01 },
        { min: z.number().int(), max: z.number().int() }, {},
        async (args) => { /* ... */ });
    }, { serverInfo: { name: "x402-ai-agent", version: "0.1.0" } },
       { recipient: sellerAccount.address, network: env.NETWORK,
         facilitator: { url: "https://x402.org/facilitator" } });
  }
  return handler;
}
export async function GET(req) { return (await getHandler())(req); }
export async function POST(req) { return (await getHandler())(req); }
```

---

# MCP Client with Payment

```typescript
// src/app/api/chat/route.ts
import { withPayment } from "x402-mcp/client";
import { createMCPClient } from "@ai-sdk/mcp";

const baseMcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(new URL("/mcp", env.URL)),
});

// Wrap with payment -- 2-arg form: (client, options)
const mcpClient = await withPayment(baseMcpClient, {
  account: purchaserAccount,  // Viem Account from CDP
  network: env.NETWORK,
  maxPaymentValue: 0.1 * 10 ** 6,  // $0.10 max per call (micro-USDC)
});

const mcpTools = await mcpClient.tools();
```

---

# ToolLoopAgent Orchestrator

```typescript
// src/lib/agents/orchestrator.ts
import { ToolLoopAgent, stepCountIs } from "ai";

export function createOrchestrator({ model, mcpTools, budget, localTools = {} }) {
  return new ToolLoopAgent({
    model,  // LanguageModel object from getModel()
    instructions: `You are an x402 AI agent with a USDC budget of
      $${budget.remainingUsdc().toFixed(2)} for this session.
      Check your budget before calling expensive tools.`,
    tools: {
      ...mcpTools,                       // Paid + free MCP tools
      ...localTools,                     // hello-local
      ...createBudgetTools(budget),      // check_budget
      ...createDiscoveryTools(registry), // search, probe, list
    },
    stopWhen: stepCountIs(10),
  });
}
```

---

# Streaming Response with Payment Tracking

```typescript
// src/app/api/chat/route.ts
const response = await createAgentUIStreamResponse({
  agent,
  uiMessages: messages,
  sendSources: true,
  sendReasoning: true,
  onStepFinish: async ({ toolResults }) => {
    for (const toolResult of toolResults ?? []) {
      const output = toolResult.output;
      const meta = output?._meta?.["x402.payment-response"];
      if (meta?.transaction) {
        const amountUsdc = (meta.amount ?? 0) / 1e6;  // micro-USDC
        budget.recordSpend(amountUsdc, toolResult.toolName, meta.transaction);
      }
    }
  },
  onFinish: async () => { await closeMcp(); },
});
```

---

# AI Provider with Gateway Fallback

```typescript
// src/lib/ai-provider.ts
import { gateway } from "ai";
import { deepseek } from "@ai-sdk/deepseek";

export function getModel(modelId: string): LanguageModel {
  // On Vercel: OIDC auto-provisioned by `vercel env pull`
  if (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY) {
    return gateway(modelId);
  }
  // Local dev: direct DeepSeek provider
  const modelName = modelId.replace(/^[^/]+\//, "");
  return deepseek(modelName);
}
```

**Vercel setup**: `vercel link` --> enable AI Gateway --> `vercel env pull`

---

<!-- _class: lead -->

# Part 5: Budget & Telemetry

## Controlling Spend and Building Audit Trails

---

# BudgetController

```typescript
// src/lib/budget-controller.ts
export class BudgetController {
  readonly sessionLimitUsdc: number;  // $0.50 default
  private spent = 0;
  private history: PaymentRecord[] = [];

  canSpend(amountUsdc, toolName) {
    if (this.spent + amountUsdc > this.sessionLimitUsdc) {
      telemetry.budgetExceeded(toolName, amountUsdc, this.remainingUsdc());
      return { allowed: false, reason: "Session limit exceeded" };
    }
    return { allowed: true };
  }

  recordSpend(amountUsdc, toolName, txHash) {
    this.spent += amountUsdc;
    this.history.push({ toolName, amountUsdc, txHash, timestamp: new Date() });
    telemetry.paymentSettled(toolName, amountUsdc, txHash);
  }
}
```

---

# Budget Enforcement Model

| Layer | Mechanism | Enforced? |
|-------|-----------|-----------|
| Agent instructions | Told budget in system prompt | Advisory |
| `check_budget` tool | Agent can self-check | Advisory |
| `canSpend()` + telemetry | Emits `budget_exceeded` event | Observability |
| `withPayment()` max value | $0.10 per call hard cap | **Hard** |
| Session limit $0.50 | BudgetController instance | Advisory |

**Worst case**: 10 steps x $0.10 = **$1.00** per request

---

# Structured Telemetry

```typescript
// src/lib/telemetry.ts -- JSON events to console.log (Vercel function logs)
export const telemetry = {
  paymentSettled(toolName, amountUsdc, txHash) {
    console.log(JSON.stringify({
      event: "payment_settled", toolName, amountUsdc, txHash,
      timestamp: new Date().toISOString(),
    }));
  },
  budgetExceeded(toolName, requestedUsdc, remainingUsdc) {
    console.log(JSON.stringify({
      event: "budget_exceeded", toolName, requestedUsdc, remainingUsdc,
      timestamp: new Date().toISOString(),
    }));
  },
};
```

---

# Service Discovery

```typescript
// Agents can search, probe, and list x402 services at runtime
const discoveryTools = {
  search_x402_services: tool({
    description: "Search registry for x402 APIs",
    inputSchema: z.object({ query: z.string(), categories: z.array(z.string()).optional() }),
    execute: async ({ query, categories }) => registry.search({ query, categories }),
  }),
  probe_x402_service: tool({
    description: "Connect to an MCP server and list its tools",
    inputSchema: z.object({ baseUrl: z.string().url() }),
    execute: async ({ baseUrl }) => {
      const client = await createMCPClient({ transport: /* ... */ });
      const tools = await client.tools();
      return { toolCount: Object.keys(tools).length, tools: /* ... */ };
    },
  }),
};
```

---

<!-- _class: lead -->

# Part 6: Best Practices

## Security, UX, and Reliability

---

# Security Checklist

- [x] **Never hardcode private keys** -- CDP manages keys, env vars for config
- [x] **Validate all inputs** -- Zod schemas on API boundaries
- [x] **Set max payment limits** -- `withPayment({ maxPaymentValue })` hard cap
- [x] **Per-session budget** -- BudgetController tracks cumulative spend
- [x] **Structured audit trail** -- Every payment logged with tx hash
- [x] **MCP client cleanup** -- `closeMcp()` guard prevents leaks
- [ ] **Registry auth** -- `POST /api/registry` currently unauthenticated
- [ ] **SSRF protection** -- `probe_x402_service` needs IP blocklist

---

# Input Validation

```typescript
// Always validate at API boundaries with Zod
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.any()).optional(),
    content: z.string().optional(),
  }).refine((msg) => (msg.parts?.length ?? 0) > 0 || (msg.content?.length ?? 0) > 0)),
  model: z.enum(["deepseek-chat", "deepseek-reasoner"]).default("deepseek-chat"),
});

const validated = ChatRequestSchema.safeParse(body);
if (!validated.success) {
  return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
}
```

---

# UX: Basescan Transaction Links

The `ToolOutput` component renders live transaction links for settled payments:

```typescript
// src/components/ai-elements/tool.tsx
{part.output?._meta?.["x402.payment-response"] && (
  <a href={`https://${
    network === "base-sepolia" ? "sepolia." : ""
  }basescan.org/tx/${part.output._meta["x402.payment-response"].transaction}`}>
    View transaction
  </a>
)}
```

The `network` prop comes from `messageMetadata: () => ({ network: env.NETWORK })` in the chat route.

---

# Error Handling Pattern

```typescript
// MCP client cleanup with double-close guard
let closed = false;
const closeMcp = async () => {
  if (closed) return;
  closed = true;
  try { await mcpClient.close(); } catch (e) { console.error(e); }
};

try {
  const response = await createAgentUIStreamResponse({
    agent, uiMessages: messages,
    onFinish: async () => { await closeMcp(); },  // success path
  });
  return response;
} catch (error) {
  await closeMcp();  // error path
  return new Response(JSON.stringify({ error: error.message }), { status: 500 });
}
```

---

<!-- _class: lead -->

# Part 7: Live Demo

## See It In Action

---

# Demo Flow

1. **Open** http://localhost:3000
2. **Ask** "What services are available?" (discovery)
3. **Ask** "What is 5 + 3?" (free tool)
4. **Ask** "Get a premium random number" (paid tool, $0.01)
5. **Ask** "Check your budget" (budget tool)
6. **Click** the Basescan link to verify the on-chain payment

---

# Expected Results

| Step | Action | Result |
|------|--------|--------|
| 1 | List services | Registry shows "x402 Demo Tools" |
| 2 | Call free tool | "8" -- no payment |
| 3 | Call paid tool | Random number + $0.01 payment |
| 4 | Check budget | $0.49 remaining, 1 payment in history |
| 5 | View transaction | Confirmed on Base Sepolia |

---

# Deploying to Vercel

```bash
# 1. Link project and enable AI Gateway
vercel link
# Enable AI Gateway in Vercel Dashboard

# 2. Pull OIDC credentials
vercel env pull  # provisions VERCEL_OIDC_TOKEN

# 3. Set CDP credentials in Dashboard
# CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
# NETWORK=base-sepolia (or base for mainnet)
# URL is auto-derived -- do not set manually

# 4. Deploy
vercel --prod
```

---

<!-- _class: lead -->

# Part 8: What's Next

## Future Directions for x402 + AI

---

# Coming Soon

- **Hard budget enforcement** -- reject EIP-3009 signing when budget exceeded
- **Persistent registry** -- Neon Postgres instead of in-memory
- **Durable agents** -- Workflow DevKit `DurableAgent` for long-running tasks
- **Human-in-the-loop** -- approval hooks for high-cost tool calls
- **Cross-agent payments** -- agents paying other agents for services
- **Dynamic pricing** -- demand-based tool pricing

---

# Resources

| Resource | Link |
|----------|------|
| **This project** | github.com/aijayz/x402-ai-agent |
| **Architecture doc** | `reports/architecture-design.md` |
| **x402 Protocol** | x402.org |
| **AI SDK v6** | ai-sdk.dev |
| **Coinbase CDP** | docs.cdp.coinbase.com |
| **MCP Specification** | modelcontextprotocol.io |
| **Base Sepolia Faucet** | faucet.circle.com |

---

<!-- _class: lead -->

# Thank You!

## Questions?

**GitHub**: github.com/aijayz/x402-ai-agent
**x402**: x402.org
**Base**: base.org

---

# Appendix: Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `CDP_API_KEY_ID` | Yes | -- |
| `CDP_API_KEY_SECRET` | Yes | -- |
| `CDP_WALLET_SECRET` | Yes | -- |
| `DEEPSEEK_API_KEY` | Local dev only | -- |
| `AI_MODEL` | No | `deepseek/deepseek-chat` |
| `AI_REASONING_MODEL` | No | `deepseek/deepseek-reasoner` |
| `NETWORK` | No | `base-sepolia` |
| `URL` | No | `http://localhost:3000` |
| `VERCEL_OIDC_TOKEN` | Vercel only | auto-provisioned |

---

# Appendix: Available Tools

| Tool | Type | Cost |
|------|------|------|
| `add` | Free (MCP) | -- |
| `get_random_number` | Free (MCP) | -- |
| `hello-remote` | Free (MCP) | -- |
| `hello-local` | Free (local) | -- |
| `premium_random` | Paid (MCP) | $0.01 |
| `premium_analysis` | Paid (MCP) | $0.02 |
| `check_budget` | Agent tool | -- |
| `search_x402_services` | Agent tool | -- |
| `probe_x402_service` | Agent tool | -- |
| `list_registered_services` | Agent tool | -- |
