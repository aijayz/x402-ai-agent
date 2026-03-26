"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Response } from "@/components/ai-elements/response";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "./code-block";
import z from "zod";
import { CopyToClipboardButton } from "../copy-to-clipboard";
import Link from "next/link";
import { getToolDisplay } from "@/lib/tool-display-config";
import { TOOL_PRICES } from "@/lib/tool-prices";
import { renderClusterOutput } from "./cluster-renderers";

/** Apply 30% markup to match what the user is actually charged. Mirrors server-side applyMarkup(). */
const MARKUP_FACTOR = 1.30;
function withMarkup(costUsdc: number): number {
  if (costUsdc === 0) return 0;
  return costUsdc * MARKUP_FACTOR;
}

/** Format crypto price with appropriate precision: >= $1 → 2dp, >= $0.01 → 4dp, < $0.01 → up to 6 significant digits */
function formatCryptoPrice(price: number): string {
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 0.01) return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  // Very small prices: show up to 6 significant digits
  return price.toLocaleString(undefined, { minimumSignificantDigits: 4, maximumSignificantDigits: 6 });
}

// Paid tool names (could also be determined dynamically)
const PAID_TOOLS = [
  "get_crypto_price",
  "get_wallet_profile",
  "summarize_url",
  "analyze_contract",
  "generate_image",
  "analyze_defi_safety",
  "track_whale_activity",
  "analyze_social_narrative",
  "analyze_market_trends",
  "analyze_wallet_portfolio",
  "screen_token_alpha",
];

const isPaidTool = (toolName: string) => PAID_TOOLS.includes(toolName);

const ToolOutputSchema = z
  .object({
    content: z.array(
      z.object({
        type: z.literal("text"),
        text: z.string(),
      })
    ),
    isError: z.boolean().optional(),
  })
  .optional();

/** Extract what the user is charged for a tool call (with 30% markup applied). */
function extractToolCost(part: ToolUIPart | DynamicToolUIPart): number | null {
  if (part.state !== "output-available") return null;

  const toolName = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);

  // MCP tools: check payment metadata or known prices
  const output = part.output as Record<string, unknown> | undefined;
  const meta = output?._meta as Record<string, unknown> | undefined;
  const paymentResponse = meta?.["x402/payment-response"] as { amount?: number } | undefined;
  if (paymentResponse?.amount != null) {
    return withMarkup(Number(paymentResponse.amount) / 1e6);
  }
  if (TOOL_PRICES[toolName]) {
    return withMarkup(TOOL_PRICES[toolName]);
  }

  // Cluster tools: check for totalCostMicroUsdc in output
  // Native AI SDK tools return ClusterResult directly as the output object
  if (output && typeof (output as Record<string, unknown>).totalCostMicroUsdc === "number") {
    const cost = (output as Record<string, unknown>).totalCostMicroUsdc as number;
    if (cost > 0) return withMarkup(cost / 1_000_000);
  }

  // MCP-wrapped cluster output: { content: [{ type: "text", text: JSON }] }
  const parsed = ToolOutputSchema.safeParse(output);
  if (parsed.success && parsed.data?.content) {
    const text = parsed.data.content.map(c => c.text).join("");
    try {
      const json = JSON.parse(text);
      if (typeof json.totalCostMicroUsdc === "number" && json.totalCostMicroUsdc > 0) {
        return withMarkup(json.totalCostMicroUsdc / 1_000_000);
      }
    } catch {
      // Not JSON cluster output
    }
  }

  return null;
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "not-prose mb-2 w-full rounded-lg border overflow-hidden",
      "bg-muted/20",
      "border-muted/40",
      className,
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  part: ToolUIPart | DynamicToolUIPart;
  className?: string;
};

const getStatusIcon = (status: ToolUIPart["state"]): ReactNode => {
  const icons: Record<ToolUIPart["state"], ReactNode> = {
    "input-streaming": <CircleIcon className="size-3 text-muted-foreground" />,
    "input-available": <ClockIcon className="size-3 animate-pulse text-muted-foreground" />,
    "output-available": <CheckCircleIcon className="size-3 text-green-500" />,
    "output-error": <XCircleIcon className="size-3 text-red-500" />,
    "approval-requested": <ClockIcon className="size-3 text-yellow-500" />,
    "approval-responded": <CheckCircleIcon className="size-3 text-blue-500" />,
    "output-denied": <XCircleIcon className="size-3 text-orange-500" />,
  };
  return icons[status];
};

const mapRenderResultTypeToState = (
  type: RenderOutputResult["type"]
): ToolUIPart["state"] => {
  if (type === "success") return "output-available";
  if (type === "error") return "output-error";
  return "output-error";
};

/** Extract a brief text snippet from tool output for the header */
function extractResultSnippet(part: ToolUIPart | DynamicToolUIPart): string | null {
  if (part.state !== "output-available") return null;

  // Try to extract from native AI SDK tool output (cluster tools, Dune, etc.)
  const raw = part.output as Record<string, unknown> | undefined;
  if (raw && !raw.content) {
    if (raw.serviceCalls && Array.isArray(raw.serviceCalls)) return `${raw.serviceCalls.length} services`;
    if (raw.template && raw.rowCount != null) return `${raw.template} · ${raw.rowCount} rows`;
  }

  // MCP tool output: { content: [{ type: "text", text }] }
  const parsed = ToolOutputSchema.safeParse(part.output);
  if (!parsed.success || !parsed.data?.content || parsed.data.isError) return null;
  const text = parsed.data.content.map(c => c.text).join("");
  try {
    const data = JSON.parse(text);
    if (data.priceUsd != null) {
      const symbol = (data.token as string)?.toUpperCase() ?? "";
      return `${symbol} $${formatCryptoPrice(Number(data.priceUsd))}`;
    }
    if (data.address && data.ethBalance != null) {
      return `${(data.address as string).slice(0, 6)}…${(data.address as string).slice(-4)}`;
    }
    if (data.summary && data.url) return new URL(data.url).hostname;
    if (data.contractName) return data.contractName;
    if (data.imageUrl) return "Image generated";
    if (data.serviceCalls?.length > 0) return `${data.serviceCalls.length} services`;
  } catch { /* not JSON */ }
  return null;
}

export const ToolHeader = ({ className, part, ...props }: ToolHeaderProps) => {
  const { state: rawState } = part;
  const toolname =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const renderResult = renderRawOutput({ output: part.output, toolName: toolname });
  const state =
    rawState === "output-available" && part.type === "dynamic-tool"
      ? mapRenderResultTypeToState(renderResult.type)
      : rawState;

  const paid = isPaidTool(toolname);
  const displayInfo = getToolDisplay(toolname);
  const cost = extractToolCost(part);
  const snippet = extractResultSnippet(part);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2",
        "hover:bg-muted/30 transition-colors duration-150",
        className
      )}
      {...props}
    >
      {getStatusIcon(state)}
      <span className="text-xs font-medium text-muted-foreground">{displayInfo.label}</span>
      {snippet && (
        <>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs font-medium">{snippet}</span>
        </>
      )}
      {cost != null && cost > 0 && (
        <>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs text-amber-500 font-medium">${cost < 0.01 ? cost.toFixed(3) : cost < 0.1 ? cost.toFixed(3) : cost.toFixed(2)}</span>
        </>
      )}
      <ChevronDownIcon className="size-3 ml-auto text-muted-foreground/50" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("overflow-hidden", className)} {...props}>
    {/* Parameters hidden by default — included in raw data toggle */}
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  part: ToolUIPart | DynamicToolUIPart;
  network?: "base-sepolia" | "base";
};

export const ToolOutput = ({
  className,
  part,
  network,
  ...props
}: ToolOutputProps) => {
  const tName = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const renderResult =
    part.type === "dynamic-tool"
      ? renderRawOutput({ output: part.output, toolName: tName })
      : ({ type: "non-dynamic-tool", content: part.output } as const);
  const errorText = part.errorText
    ? part.errorText
    : renderResult.type === "error"
      ? JSON.stringify(renderResult.content)
      : undefined;

  if (!(part.output || errorText)) {
    return null;
  }

  // Build a user-friendly summary for errors
  const friendlyError = errorText
    ? errorText.includes("Payment required")
      ? "Processing payment..."
      : errorText.length > 100
        ? errorText.slice(0, 100) + "..."
        : errorText
    : undefined;

  return (
    <div className={cn("space-y-3 p-4", className)} {...props}>
      {/* Friendly error message */}
      {friendlyError && (
        <div className="text-sm text-destructive">{friendlyError}</div>
      )}
      {/* Friendly result content (no raw JSON) */}
      {!errorText && (
        <div className="overflow-x-auto rounded-md text-xs [&_table]:w-full bg-muted/50 text-foreground">
          {renderResult.type === "success" ? (
            renderResult.content
          ) : renderResult.type === "non-dynamic-tool" ? (
            <Response>{String(renderResult.content)}</Response>
          ) : null}
        </div>
      )}
      {/* Cluster unavailable services */}
      {(() => {
        const parsed = ToolOutputSchema.safeParse(part.output);
        if (!parsed.success || !parsed.data?.content) return null;
        const text = parsed.data.content.map(c => c.text).join("");
        try {
          const json = JSON.parse(text);
          if (!Array.isArray(json.unavailableServices) || json.unavailableServices.length === 0) return null;
          return (
            <div className="mt-3 pt-3 border-t border-muted/40">
              <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Services Coming Soon
              </h5>
              <div className="grid gap-2">
                {json.unavailableServices.map((svc: { name: string; purpose: string; typicalCostUsdc: number }, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{svc.name}</span>
                      <span className="text-xs text-muted-foreground">{svc.purpose}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">~${svc.typicalCostUsdc.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        } catch {
          return null;
        }
      })()}
      {/* Raw data toggle — parameters + full output hidden here */}
      {(part.output != null || part.input != null) && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Show raw data
          </summary>
          <div className="mt-1 space-y-2">
            {part.input != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Parameters</div>
                <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              </div>
            )}
            {part.output != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Output</div>
                <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40">
                  {JSON.stringify(part.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
      {/* @ts-expect-error */}
      {part.output?._meta?.["x402/payment-response"] && (
        <div className="mt-3 pt-3 border-t border-muted/40">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              <ZapIcon className="size-3" />
              Payment Successful
              {(() => {
                // x402-mcp doesn't include amount in payment response, use known prices
                const tName = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
                // @ts-expect-error - x402 payment metadata
                const amount = part.output?._meta?.["x402/payment-response"]?.amount;
                const displayAmount = amount != null
                  ? (Number(amount) / 1e6).toFixed(2)
                  : TOOL_PRICES[tName]?.toFixed(2);
                if (displayAmount) {
                  return <span className="ml-1">&middot; ${displayAmount} USDC</span>;
                }
                return null;
              })()}
            </div>
            <span className="text-muted-foreground">via x402</span>
          </div>
          {/* @ts-expect-error */}
          {part.output?._meta?.["x402/payment-response"]?.transaction && (
            <div className="mt-2 flex items-center gap-2">
              <Link
                href={`https://${
                  network === "base-sepolia" ? "sepolia." : ""
                  // @ts-expect-error
                }basescan.org/tx/${part.output._meta["x402/payment-response"].transaction}`}
                target="_blank"
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-mono"
              >
                {/* @ts-expect-error */}
                {part.output._meta["x402/payment-response"].transaction.slice(0, 18)}...
                {/* @ts-expect-error */}
                {part.output._meta["x402/payment-response"].transaction.slice(-6)}
              </Link>
              <CopyToClipboardButton
                // @ts-expect-error
                content={part.output._meta["x402/payment-response"].transaction}
                className="size-6"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type RenderOutputResult =
  | {
      type: "success";
      content: ReactNode;
    }
  | {
      type: "error";
      content: string;
    }
  | {
      type: "failed-to-parse";
      content: unknown;
    };

function renderToolSpecificOutput(toolName: string, jsonText: string): ReactNode | null {
  try {
    const data = JSON.parse(jsonText);

    // Cluster tools — rich per-service visual renderers
    if (["analyze_defi_safety", "track_whale_activity", "analyze_social_narrative", "analyze_market_trends", "analyze_wallet_portfolio", "screen_token_alpha"].includes(toolName)) {
      const rendered = renderClusterOutput(data);
      if (rendered) return rendered;
    }

    // Dune query_onchain_data — render time-series as formatted table
    if (toolName === "query_onchain_data" && Array.isArray(data.data) && data.data.length > 0) {
      const rows = data.data as Record<string, unknown>[];
      const cols = Object.keys(rows[0]);
      const isDateCol = (col: string) => /day|date|time|block_date/i.test(col);
      const isNumCol = (col: string) => /usd|flow|volume|count|pnl|score|amount|risk/i.test(col);

      const fmtVal = (col: string, val: unknown): string => {
        if (val == null) return "—";
        if (isDateCol(col) && typeof val === "string") {
          try { return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return String(val); }
        }
        if (typeof val === "number") {
          if (isNumCol(col)) {
            if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
            if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
            return `$${val.toFixed(2)}`;
          }
          return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return String(val);
      };

      const colLabel = (col: string) => col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const numColor = (col: string, val: unknown): string => {
        if (typeof val !== "number" || !(/flow|change|pnl/i.test(col))) return "";
        return val > 0 ? "text-green-400" : val < 0 ? "text-red-400" : "";
      };

      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{data.template}</span>
            <span>·</span>
            <span>{data.rowCount} rows</span>
            {data.freshness && <><span>·</span><span>{data.freshness}</span></>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {cols.map(col => (
                    <th key={col} className={`py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap ${isNumCol(col) ? "text-right" : "text-left"}`}>
                      {colLabel(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "bg-muted/20" : ""}>
                    {cols.map(col => (
                      <td key={col} className={`py-1.5 px-2 font-mono whitespace-nowrap ${isNumCol(col) ? "text-right" : ""} ${numColor(col, row[col])}`}>
                        {fmtVal(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (toolName === "get_crypto_price" && data.priceUsd != null) {
      const changePositive = (data.change24h ?? 0) >= 0;
      return (
        <div className="p-3 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{data.token}</div>
          <div className="text-2xl font-bold font-mono">${formatCryptoPrice(Number(data.priceUsd))}</div>
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
          <img
            src={data.imageUrl}
            alt={data.prompt}
            className="rounded-lg max-w-full max-h-80 object-contain"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              const fallback = target.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
          />
          <div className="hidden items-center gap-2 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            Image failed to load. The generation service may be temporarily unavailable.
          </div>
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

function renderRawOutput({
  output,
  toolName,
}: {
  output: ToolUIPart["output"];
  toolName?: string;
}): RenderOutputResult {
  // Native AI SDK tool output (cluster tools, Dune, etc.) — not MCP-wrapped
  const raw = output as Record<string, unknown> | undefined;
  if (raw && !raw.content && !raw.isError && toolName) {
    const toolSpecific = renderToolSpecificOutput(toolName, JSON.stringify(raw));
    if (toolSpecific) {
      return { type: "success", content: toolSpecific };
    }
  }

  const parseResult = ToolOutputSchema.safeParse(output);
  if (!parseResult.success) {
    return {
      type: "failed-to-parse",
      content: output,
    };
  }
  if (!parseResult.data) {
    return {
      type: "success",
      content: null,
    };
  }
  if (parseResult.data.isError) {
    const errorText = parseResult.data.content.map((item) => item.text).join("");
    // Detect x402 payment-required errors and render them cleanly
    if (errorText.includes("x402Version") && errorText.includes("payment is required")) {
      return {
        type: "error",
        content: "Payment required — retrying with automatic payment...",
      };
    }
    return {
      type: "error",
      content: errorText,
    };
  }
  const textContent = parseResult.data.content.map((item) => item.text).join("");
  const toolSpecific = toolName ? renderToolSpecificOutput(toolName, textContent) : null;

  return {
    type: "success",
    content: toolSpecific ?? <Response>{textContent}</Response>,
  };
}
