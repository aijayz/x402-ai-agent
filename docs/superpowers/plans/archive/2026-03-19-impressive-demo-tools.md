# Impressive Demo Tools — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder paid tools with 5 real, impressive tools (crypto price, wallet profile, URL summary, contract analysis, image generation) and polish the UI to match.

**Architecture:** All paid tools live in `src/app/mcp/route.ts` registered via `server.paidTool()`. Tools call external free APIs (CoinGecko, Basescan, Pollinations) or the existing DeepSeek key. UI enhancements go in `tool.tsx` and `page.tsx`. No new dependencies.

**Tech Stack:** Next.js 15, x402-mcp, viem (Base RPC), CoinGecko API, Basescan API, Pollinations.ai, DeepSeek, Zod.

**Spec:** `docs/superpowers/specs/2026-03-18-impressive-demo-tools-design.md`

---

## Scope & Phase Overview

| Phase | Name | Purpose | Depends On |
|-------|------|---------|------------|
| 1 | Replace MCP Tools | Remove old tools, add 5 new paid tools | — |
| 2 | Chat Route Cleanup | Remove hello-local, bump maxDuration, update orchestrator instructions | Phase 1 |
| 3 | UI Polish | Rich tool rendering, payment amount, suggestions, budget indicator | Phase 1 |

Phases 2 and 3 are independent of each other and can be parallelized after Phase 1.

---

## File Map

| File | Action | Phase |
|------|--------|-------|
| `src/app/mcp/route.ts` | Modify — remove old tools, add 5 new paid tools | 1 |
| `src/app/api/chat/route.ts` | Modify — remove hello-local, bump maxDuration to 60 | 2 |
| `src/lib/agents/orchestrator.ts` | Modify — update system instructions for new tools | 2 |
| `src/components/ai-elements/tool.tsx` | Modify — rich rendering, payment amount, update PAID_TOOLS | 3 |
| `src/app/page.tsx` | Modify — update suggestions, add budget indicator | 3 |

---

## Phase 1: Replace MCP Tools

### Task 1.1: Remove Old Tools from MCP Server

**Files:**
- Modify: `src/app/mcp/route.ts:44-102`

- [ ] **Step 1: Remove `hello-remote` free tool**

Delete lines 44-53 in `src/app/mcp/route.ts` (the `hello-remote` tool registration).

- [ ] **Step 2: Remove `premium_random` paid tool**

Delete lines 55-77 (the `premium_random` paidTool registration).

- [ ] **Step 3: Remove `premium_analysis` paid tool**

Delete lines 79-102 (the `premium_analysis` paidTool registration).

- [ ] **Step 4: Verify free tools `add` and `get_random_number` are untouched**

Lines 15-43 should remain as-is.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — no references to removed tools in this file.

- [ ] **Step 6: Commit**

```bash
git add src/app/mcp/route.ts
git commit -m "refactor: remove placeholder hello-remote, premium_random, premium_analysis tools"
```

---

### Task 1.2: Add `get_crypto_price` Paid Tool ($0.01)

**Files:**
- Modify: `src/app/mcp/route.ts`

- [ ] **Step 1: Add the tool after the existing free tools**

Add this after the `add` tool registration (after the closing `);` of the `add` tool):

```typescript
        // Paid tools (require USDC payment)
        server.paidTool(
          "get_crypto_price",
          "Get live cryptocurrency price, 24h change, and market cap for any token",
          { price: 0.01 },
          {
            token: z.string().describe("Token ID, e.g. 'bitcoin', 'ethereum', 'solana'"),
          },
          {},
          async (args) => {
            try {
              const res = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(args.token)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
              );
              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Error: CoinGecko API returned ${res.status}. ${res.status === 429 ? "Rate limited — try again in a moment." : ""}` }],
                  isError: true,
                };
              }
              const data = await res.json();
              const tokenData = data[args.token];
              if (!tokenData) {
                return {
                  content: [{ type: "text", text: `Token "${args.token}" not found. Use CoinGecko IDs like "bitcoin", "ethereum", "solana".` }],
                  isError: true,
                };
              }
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    token: args.token,
                    priceUsd: tokenData.usd,
                    change24h: tokenData.usd_24h_change,
                    marketCap: tokenData.usd_market_cap,
                  }),
                }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error fetching price: ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        );
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/mcp/route.ts
git commit -m "feat: add get_crypto_price paid tool ($0.01)"
```

---

### Task 1.3: Add `get_wallet_profile` Paid Tool ($0.02)

**Files:**
- Modify: `src/app/mcp/route.ts`

This tool needs viem to query Base RPC. The `getPublicClient()` and `getChain()` helpers already exist in `src/lib/accounts.ts` but are not exported. We need to either export them or recreate the client inline. Since `accounts.ts` already exports `getChain()`, we'll import that and create a public client in the route file.

- [ ] **Step 1: Add imports at top of `src/app/mcp/route.ts`**

```typescript
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { getChain } from "@/lib/accounts";
```

- [ ] **Step 2: Add USDC contract address map above `getHandler()`**

```typescript
const USDC_ADDRESS: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
```

- [ ] **Step 3: Add the paid tool after `get_crypto_price`**

```typescript
        server.paidTool(
          "get_wallet_profile",
          "Get ETH balance, USDC balance, and transaction count for any EVM address on Base",
          { price: 0.02 },
          {
            address: z.string().describe("EVM wallet address (0x...)"),
          },
          {},
          async (args) => {
            try {
              const client = createPublicClient({
                chain: getChain(),
                transport: http(),
              });
              const addr = args.address as `0x${string}`;
              const usdcAddr = USDC_ADDRESS[env.NETWORK];

              const [ethBalance, usdcBalance, txCount] = await Promise.all([
                client.getBalance({ address: addr }),
                client.readContract({
                  address: usdcAddr,
                  abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
                  functionName: "balanceOf",
                  args: [addr],
                }),
                client.getTransactionCount({ address: addr }),
              ]);

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    address: args.address,
                    ethBalance: formatEther(ethBalance),
                    usdcBalance: formatUnits(usdcBalance, 6),
                    transactionCount: txCount,
                    network: env.NETWORK,
                  }),
                }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error querying wallet: ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        );
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/mcp/route.ts
git commit -m "feat: add get_wallet_profile paid tool ($0.02)"
```

---

### Task 1.4: Add `summarize_url` Paid Tool ($0.03)

**Files:**
- Modify: `src/app/mcp/route.ts`

This tool fetches a URL and calls DeepSeek for summarization. It needs the AI provider.

- [ ] **Step 1: Add AI imports at top of `src/app/mcp/route.ts`**

```typescript
import { generateText } from "ai";
import { getModel } from "@/lib/ai-provider";
```

- [ ] **Step 2: Add the paid tool after `get_wallet_profile`**

```typescript
        server.paidTool(
          "summarize_url",
          "Fetch a webpage and return an AI-generated summary of its content",
          { price: 0.03 },
          {
            url: z.string().url().describe("URL to fetch and summarize"),
          },
          {},
          async (args) => {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 10000);
              const res = await fetch(args.url, { signal: controller.signal });
              clearTimeout(timeout);

              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Error: Failed to fetch URL (HTTP ${res.status})` }],
                  isError: true,
                };
              }

              const contentType = res.headers.get("content-type") || "";
              if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
                return {
                  content: [{ type: "text", text: `Unsupported content type: ${contentType}. Only HTML and plain text pages are supported.` }],
                  isError: true,
                };
              }

              const html = await res.text();
              // Strip HTML tags and take first ~3000 chars
              const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
              const wordCount = text.split(/\s+/).length;

              const { text: summary } = await generateText({
                model: getModel(env.AI_MODEL),
                prompt: `Summarize the following webpage content in 2-3 concise paragraphs:\n\n${text}`,
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    url: args.url,
                    summary,
                    wordCount,
                  }),
                }],
              };
            } catch (err) {
              const msg = err instanceof Error && err.name === "AbortError"
                ? "Request timed out after 10 seconds"
                : err instanceof Error ? err.message : "Unknown error";
              return {
                content: [{ type: "text", text: `Error summarizing URL: ${msg}` }],
                isError: true,
              };
            }
          }
        );
```

- [ ] **Step 3: Add `AI_MODEL` to env import if needed**

Check that `env.AI_MODEL` is accessible. It is — `env.ts` already defines `AI_MODEL` with default `"deepseek/deepseek-chat"`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/mcp/route.ts
git commit -m "feat: add summarize_url paid tool ($0.03)"
```

---

### Task 1.5: Add `analyze_contract` Paid Tool ($0.03)

**Files:**
- Modify: `src/app/mcp/route.ts`

- [ ] **Step 1: Add Basescan host map above `getHandler()`**

```typescript
const BASESCAN_HOST: Record<string, string> = {
  "base-sepolia": "api-sepolia.basescan.org",
  "base": "api.basescan.org",
};
```

- [ ] **Step 2: Add the paid tool after `summarize_url`**

```typescript
        server.paidTool(
          "analyze_contract",
          "Fetch a verified smart contract's source code from Basescan and provide AI analysis of its purpose, functions, and risks",
          { price: 0.03 },
          {
            address: z.string().describe("Contract address on Base (0x...)"),
          },
          {},
          async (args) => {
            try {
              const host = BASESCAN_HOST[env.NETWORK];
              const res = await fetch(
                `https://${host}/api?module=contract&action=getsourcecode&address=${encodeURIComponent(args.address)}`
              );
              if (!res.ok) {
                return {
                  content: [{ type: "text", text: `Error: Basescan API returned ${res.status}${res.status === 429 ? ". Rate limited — try again in a few seconds." : ""}` }],
                  isError: true,
                };
              }

              const data = await res.json();
              const result = data.result?.[0];

              if (!result || !result.SourceCode || result.ABI === "Contract source code not verified") {
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      address: args.address,
                      isVerified: false,
                      contractName: null,
                      analysis: "Contract source code is not verified on Basescan. Cannot analyze unverified contracts.",
                    }),
                  }],
                };
              }

              // Truncate source to ~4000 chars for DeepSeek context
              const source = result.SourceCode.slice(0, 4000);

              const { text: analysis } = await generateText({
                model: getModel(env.AI_MODEL),
                prompt: `Analyze this Solidity smart contract. Explain: 1) What it does, 2) Key functions, 3) Potential risks or concerns.\n\nContract: ${result.ContractName}\n\n${source}`,
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    address: args.address,
                    contractName: result.ContractName,
                    isVerified: true,
                    analysis,
                  }),
                }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: `Error analyzing contract: ${err instanceof Error ? err.message : "Unknown error"}` }],
                isError: true,
              };
            }
          }
        );
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/mcp/route.ts
git commit -m "feat: add analyze_contract paid tool ($0.03)"
```

---

### Task 1.6: Add `generate_image` Paid Tool ($0.05)

**Files:**
- Modify: `src/app/mcp/route.ts`

- [ ] **Step 1: Add the paid tool after `analyze_contract`**

```typescript
        server.paidTool(
          "generate_image",
          "Generate an AI image from a text prompt using Pollinations.ai",
          { price: 0.05 },
          {
            prompt: z.string().describe("Text description of the image to generate"),
            width: z.number().int().min(256).max(1024).default(512).describe("Image width in pixels"),
            height: z.number().int().min(256).max(1024).default(512).describe("Image height in pixels"),
          },
          {},
          async (args) => {
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}?width=${args.width}&height=${args.height}&nologo=true`;

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  prompt: args.prompt,
                  imageUrl,
                  width: args.width,
                  height: args.height,
                }),
              }],
            };
          }
        );
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/mcp/route.ts
git commit -m "feat: add generate_image paid tool ($0.05)"
```

---

## Phase 2: Chat Route Cleanup

### Task 2.1: Remove hello-local and Bump maxDuration

**Files:**
- Modify: `src/app/api/chat/route.ts:56,139-142`

- [ ] **Step 1: Add maxDuration export (or update if it exists)**

In `src/app/api/chat/route.ts`, add this line before the `POST` export (around line 56):

```typescript
export const maxDuration = 60;
```

If `export const maxDuration = 30` already exists, change `30` to `60`. If it doesn't exist, add it as a new line.

- [ ] **Step 2: Remove hello-local tool definition**

In `src/app/api/chat/route.ts`, find the `localTools` object passed to `createOrchestrator()` (around line 139). Replace:
```typescript
      localTools: {
        "hello-local": tool({
          description: "Receive a greeting from the local server",
          inputSchema: z.object({ name: z.string() }),
          execute: async (args) => `Hello ${args.name} (from local tool)`,
        }),
      },
```
with:
```typescript
      localTools: {},
```

- [ ] **Step 3: Remove unused `tool` import if it was only used for hello-local**

Check if `tool` from `"ai"` is still used elsewhere in the file. If the `createAgentUIStreamResponse` import is on the same line, keep that import and only remove `tool`. If `tool` is unused, remove it from the import.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "chore: remove hello-local tool, bump maxDuration to 60s"
```

---

### Task 2.2: Update Orchestrator System Instructions

**Files:**
- Modify: `src/lib/agents/orchestrator.ts:31-37`

- [ ] **Step 1: Update the instructions string to reference new tools**

Replace the existing `instructions` string in `createOrchestrator()`:

```typescript
    instructions: `You are an autonomous x402 AI agent with a USDC budget of $${budget.remainingUsdc().toFixed(2)} for this session.

You have access to paid tools that cost real USDC on the Base blockchain:
- get_crypto_price ($0.01) — live cryptocurrency prices
- get_wallet_profile ($0.02) — on-chain wallet balances and activity
- summarize_url ($0.03) — fetch and summarize any webpage
- analyze_contract ($0.03) — analyze verified smart contracts
- generate_image ($0.05) — AI image generation

You also have free tools: add, get_random_number, check_budget, search_x402_services, probe_x402_service, list_registered_services.

Be transparent about costs — tell the user what you're spending and why. When a paid tool returns a 402 error, retry the same call immediately — payment is handled automatically.

When using generate_image, describe the generated image in your response but do NOT include the image URL as a markdown image link — the image is displayed automatically in the tool output card.`,
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/orchestrator.ts
git commit -m "chore: update orchestrator instructions for new tool catalog"
```

---

## Phase 3: UI Polish

### Task 3.1: Update PAID_TOOLS List and Payment Amount Display

**Files:**
- Modify: `src/components/ai-elements/tool.tsx:29,216-245`

- [ ] **Step 1: Update PAID_TOOLS array**

Replace:
```typescript
const PAID_TOOLS = ["premium_random", "premium_analysis"];
```
with:
```typescript
const PAID_TOOLS = [
  "get_crypto_price",
  "get_wallet_profile",
  "summarize_url",
  "analyze_contract",
  "generate_image",
];
```

- [ ] **Step 2: Add payment amount to the payment success badge**

In `ToolOutput`, find the payment response section (around line 216). Replace:
```typescript
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              <ZapIcon className="size-3" />
              Payment Successful
            </div>
            <span className="text-muted-foreground">via x402</span>
```
with:
```typescript
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              <ZapIcon className="size-3" />
              Payment Successful
              {(() => {
                // @ts-expect-error - x402 payment metadata
                const amount = part.output?._meta?.["x402.payment-response"]?.amount;
                if (amount != null) {
                  return <span className="ml-1">&middot; ${(Number(amount) / 1e6).toFixed(2)} USDC</span>;
                }
                return null;
              })()}
            </div>
            <span className="text-muted-foreground">via x402</span>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-elements/tool.tsx
git commit -m "feat: update PAID_TOOLS list and show payment amount in badge"
```

---

### Task 3.2: Add Tool-Specific Rich Rendering

**Files:**
- Modify: `src/components/ai-elements/tool.tsx`

- [ ] **Step 1: Add a `renderToolSpecificOutput` function before the `ToolOutput` component**

This function detects the tool name and returns custom JSX, or `null` to fall through to the default renderer.

```typescript
function renderToolSpecificOutput(toolName: string, jsonText: string): ReactNode | null {
  try {
    const data = JSON.parse(jsonText);

    if (toolName === "get_crypto_price" && data.priceUsd != null) {
      const changePositive = (data.change24h ?? 0) >= 0;
      return (
        <div className="p-3 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{data.token}</div>
          <div className="text-2xl font-bold font-mono">${Number(data.priceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="flex items-center gap-3 text-sm">
            <span className={changePositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
              {changePositive ? "+" : ""}{Number(data.change24h).toFixed(2)}% (24h)
            </span>
            {data.marketCap && (
              <span className="text-muted-foreground">MCap: ${Number(data.marketCap).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            )}
          </div>
        </div>
      );
    }

    if (toolName === "get_wallet_profile" && data.address) {
      return (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{data.address.slice(0, 6)}...{data.address.slice(-4)}</span>
            <CopyToClipboardButton content={data.address} className="size-5" />
            <Badge variant="secondary" className="text-xs">{data.network}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/50 p-2 text-center">
              <div className="text-xs text-muted-foreground">ETH</div>
              <div className="font-mono text-sm font-medium">{Number(data.ethBalance).toFixed(4)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2 text-center">
              <div className="text-xs text-muted-foreground">USDC</div>
              <div className="font-mono text-sm font-medium">{Number(data.usdcBalance).toFixed(2)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2 text-center">
              <div className="text-xs text-muted-foreground">Txns</div>
              <div className="font-mono text-sm font-medium">{data.transactionCount}</div>
            </div>
          </div>
        </div>
      );
    }

    if (toolName === "generate_image" && data.imageUrl) {
      return (
        <div className="p-3 space-y-2">
          <img src={data.imageUrl} alt={data.prompt} className="rounded-lg max-w-full max-h-80 object-contain" />
          <div className="text-xs text-muted-foreground italic">{data.prompt}</div>
        </div>
      );
    }

    if (toolName === "summarize_url" && data.summary) {
      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">{data.url}</a>
            <Badge variant="secondary" className="text-xs shrink-0">{data.wordCount} words</Badge>
          </div>
          <Response>{data.summary}</Response>
        </div>
      );
    }

    if (toolName === "analyze_contract" && data.address) {
      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{data.address.slice(0, 6)}...{data.address.slice(-4)}</span>
            {data.contractName && <span className="text-sm font-medium">{data.contractName}</span>}
            <Badge variant={data.isVerified ? "default" : "destructive"} className="text-xs">
              {data.isVerified ? "Verified" : "Unverified"}
            </Badge>
          </div>
          <Response>{data.analysis}</Response>
        </div>
      );
    }
  } catch {
    // Not JSON or doesn't match expected shape — fall through to default
  }
  return null;
}
```

- [ ] **Step 2: Wire `renderToolSpecificOutput` into `renderRawOutput`**

In the `renderRawOutput` function, inside the success branch (where it returns `<Response>`), add a check for tool-specific rendering. The function currently returns:

```typescript
  return {
    type: "success",
    content: (
      <Response>
        {parseResult.data.content.map((item) => item.text).join("")}
      </Response>
    ),
  };
```

We need to pass the tool name into `renderRawOutput`. Update the function signature to accept `toolName?: string` and modify the success return:

```typescript
function renderRawOutput({
  output,
  toolName,
}: {
  output: ToolUIPart["output"];
  toolName?: string;
}): RenderOutputResult {
```

Then in the success branch:

```typescript
  const textContent = parseResult.data.content.map((item) => item.text).join("");
  const toolSpecific = toolName ? renderToolSpecificOutput(toolName, textContent) : null;

  return {
    type: "success",
    content: toolSpecific ?? <Response>{textContent}</Response>,
  };
```

- [ ] **Step 3: Update all call sites of `renderRawOutput` to pass `toolName`**

In `ToolHeader` (around line 93):
```typescript
  const renderResult = renderRawOutput({ output: part.output, toolName: part.type === "dynamic-tool" ? part.toolName : part.type.slice(5) });
```

In `ToolOutput` (around line 177-180):
```typescript
  const tName = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const renderResult =
    part.type === "dynamic-tool"
      ? renderRawOutput({ output: part.output, toolName: tName })
      : ({ type: "non-dynamic-tool", content: part.output } as const);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai-elements/tool.tsx
git commit -m "feat: add tool-specific rich rendering for all paid tools"
```

---

### Task 3.3: Update Suggestions

**Files:**
- Modify: `src/app/page.tsx:49-54`

- [ ] **Step 1: Replace the suggestions object**

Replace:
```typescript
const suggestions = {
  "Ask a question": "What is blockchain technology?",
  "Use a free tool": "Get a random number between 1 and 10.",
  "Check my balance": "What is my USDC balance?",
  "Use a paid tool ($0.01)": "Get a premium random number between 1 and 100.",
};
```
with:
```typescript
const suggestions = {
  "Check crypto price": "What's the current price of Ethereum?",
  "Analyze a wallet": "Show me the wallet profile for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "Summarize a page": "Summarize https://x402.org for me",
  "Generate art ($0.05)": "Generate an image of a cyberpunk cityscape at sunset",
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update suggestion buttons for new tool catalog"
```

---

### Task 3.4: Add Budget Indicator in Prompt Bar

**Files:**
- Modify: `src/app/api/chat/route.ts` (add budget to messageMetadata)
- Modify: `src/app/page.tsx` (display budget badge)

- [ ] **Step 1: Add budget to messageMetadata in chat route**

In `src/app/api/chat/route.ts`, find the `messageMetadata` callback in `createAgentUIStreamResponse`:

```typescript
      messageMetadata: () => ({ network: env.NETWORK }),
```

Replace with:

```typescript
      messageMetadata: () => ({
        network: env.NETWORK,
        budgetRemaining: budget.remainingUsdc(),
      }),
```

- [ ] **Step 2: Add budget state tracking in page.tsx**

In `src/app/page.tsx`, add state for budget:

```typescript
const [budgetRemaining, setBudgetRemaining] = useState<number | null>(null);
```

- [ ] **Step 3: Add `useEffect` import at top of `page.tsx`**

At the top of `src/app/page.tsx`, update the React import (line 22) from:
```typescript
import { useState } from "react";
```
to:
```typescript
import { useEffect, useState } from "react";
```

- [ ] **Step 4: Extract budget from message metadata on each assistant message**

Inside the `ChatBotDemo` component, after the `useChat` call, add:

```typescript
useEffect(() => {
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  const meta = lastAssistant?.metadata as Record<string, unknown> | undefined;
  if (meta?.budgetRemaining != null) {
    setBudgetRemaining(Number(meta.budgetRemaining));
  }
}, [messages]);
```

Note: `metadata` is typed as `unknown` by AI SDK, so we cast to `Record<string, unknown>` to access `budgetRemaining`.

- [ ] **Step 4: Add budget badge to the prompt toolbar**

In the `PromptInputTools` section, add a budget display before the model selector:

```typescript
<PromptInputTools>
  {budgetRemaining !== null && (
    <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
      <CreditCardIcon className="size-3" />
      <span className="font-mono">${budgetRemaining.toFixed(2)}</span>
      <span>remaining</span>
    </div>
  )}
  <PromptInputModelSelect ...>
```

Add `CreditCardIcon` to the lucide-react imports at the top of the file:

```typescript
import { AlertCircle, CreditCardIcon, RefreshCw } from "lucide-react";
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts src/app/page.tsx
git commit -m "feat: add budget indicator in prompt toolbar"
```

---

## Verification

### Task 4.1: Manual End-to-End Test

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test each suggestion button**

Click each of the 4 suggestion buttons. Verify:
1. "Check crypto price" — returns Ethereum price with green/red change, shown in rich card
2. "Analyze a wallet" — returns wallet balances in grid layout
3. "Summarize a page" — returns summary with word count badge
4. "Generate art" — returns image displayed inline in tool card

- [ ] **Step 3: Verify payment flow**

For each paid tool:
- Payment badge shows "Payment Successful · $X.XX USDC · via x402"
- Basescan transaction link is present and clickable
- Budget indicator in toolbar decreases after each paid call

- [ ] **Step 4: Verify free tools still work**

Ask: "Add 5 and 3" — should use `add` tool, no payment badge
Ask: "Get a random number between 1 and 100" — should use `get_random_number`, no payment badge

- [ ] **Step 5: Run typecheck one final time**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

## Recommended Execution Order

```
Phase 1 (Tasks 1.1 → 1.6) — sequential, each adds one tool
    │
    ├──── Phase 2 (Tasks 2.1 → 2.2) — chat route cleanup
    │
    └──── Phase 3 (Tasks 3.1 → 3.4) — UI polish
              (3.1 and 3.2 modify tool.tsx — run sequentially)
              (3.3 and 3.4 modify page.tsx — run sequentially)

Phase 4 (Task 4.1) — manual verification after all phases
```

Phases 2 and 3 can run in parallel after Phase 1, but within each phase tasks should be sequential since they modify the same files.
