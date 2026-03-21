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
  CreditCardIcon,
  WrenchIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "./code-block";
import z from "zod";
import { CopyToClipboardButton } from "../copy-to-clipboard";
import Link from "next/link";

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
  "analyze_solana_staking",
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

const TOOL_PRICES: Record<string, number> = {
  get_crypto_price: 0.01,
  get_wallet_profile: 0.02,
  summarize_url: 0.03,
  analyze_contract: 0.03,
  generate_image: 0.05,
};

function extractToolCost(part: ToolUIPart | DynamicToolUIPart): number | null {
  if (part.state !== "output-available") return null;

  const toolName = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);

  // MCP tools: check payment metadata or known prices
  const output = part.output as Record<string, unknown> | undefined;
  const meta = output?._meta as Record<string, unknown> | undefined;
  const paymentResponse = meta?.["x402.payment-response"] as { amount?: number } | undefined;
  if (paymentResponse?.amount != null) {
    return Number(paymentResponse.amount) / 1e6;
  }
  if (TOOL_PRICES[toolName]) {
    return TOOL_PRICES[toolName];
  }

  // Cluster tools: parse output for totalCostMicroUsdc
  const parsed = ToolOutputSchema.safeParse(output);
  if (parsed.success && parsed.data?.content) {
    const text = parsed.data.content.map(c => c.text).join("");
    try {
      const json = JSON.parse(text);
      if (typeof json.totalCostMicroUsdc === "number" && json.totalCostMicroUsdc > 0) {
        return json.totalCostMicroUsdc / 1_000_000;
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
      "not-prose mb-4 w-full rounded-xl border overflow-hidden",
      "bg-gradient-to-br from-background to-muted/30",
      "shadow-sm hover:shadow-md transition-shadow duration-200",
      "border-muted/60",
      className,
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  part: ToolUIPart | DynamicToolUIPart;
  className?: string;
};

const getStatusBadge = (status: ToolUIPart["state"]) => {
  const labels: Record<ToolUIPart["state"], string> = {
    "input-streaming": "Pending",
    "input-available": "Running",
    "output-available": "Completed",
    "output-error": "Error",
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Approved",
    "output-denied": "Denied",
  };

  const icons: Record<ToolUIPart["state"], ReactNode> = {
    "input-streaming": <CircleIcon className="size-4" />,
    "input-available": <ClockIcon className="size-4 animate-pulse" />,
    "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
    "output-error": <XCircleIcon className="size-4 text-red-600" />,
    "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
    "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
    "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  };

  return (
    <Badge className="rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  );
};

const mapRenderResultTypeToState = (
  type: RenderOutputResult["type"]
): ToolUIPart["state"] => {
  if (type === "success") return "output-available";
  if (type === "error") return "output-error";
  return "output-error";
};

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

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-4",
        "bg-muted/30 hover:bg-muted/50 transition-colors duration-150",
        "border-b border-muted/40",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center justify-center size-8 rounded-lg",
            paid
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
              : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          )}
        >
          {paid ? <CreditCardIcon className="size-4" /> : <WrenchIcon className="size-4" />}
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <span className="font-semibold text-sm">{toolname}</span>
          {paid && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Paid Tool
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const cost = extractToolCost(part);
            if (cost != null && cost > 0) {
              return (
                <Badge className="rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" variant="outline">
                  ${cost.toFixed(2)}
                </Badge>
              );
            }
            return null;
          })()}
          {getStatusBadge(state)}
        </div>
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
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
  <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
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

  return (
    <div className={cn("space-y-3 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "text-destructive" : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {renderResult.type === "success" ? (
          renderResult.content
        ) : renderResult.type === "non-dynamic-tool" ? (
          JSON.stringify(renderResult.content)
        ) : renderResult.type === "failed-to-parse" ? (
          <CodeBlock
            code={JSON.stringify(renderResult.content, null, 2)}
            language="json"
          />
        ) : null}
      </div>
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
      {/* @ts-expect-error */}
      {part.output?._meta?.["x402.payment-response"] && (
        <div className="mt-3 pt-3 border-t border-muted/40">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              <ZapIcon className="size-3" />
              Payment Successful
              {(() => {
                // x402-mcp doesn't include amount in payment response, use known prices
                const tName = part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
                // @ts-expect-error - x402 payment metadata
                const amount = part.output?._meta?.["x402.payment-response"]?.amount;
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
          <div className="mt-2 flex items-center gap-2">
            <Link
              href={`https://${
                network === "base-sepolia" ? "sepolia." : ""
              }basescan.org/tx/${
                // @ts-expect-error
                part.output._meta["x402.payment-response"].transaction}`}
              target="_blank"
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-mono"
            >
              {/* @ts-expect-error */}
              {part.output._meta["x402.payment-response"].transaction.slice(0, 18)}...
              {/* @ts-expect-error */}
              {part.output._meta["x402.payment-response"].transaction.slice(-6)}
            </Link>
            <CopyToClipboardButton
              // @ts-expect-error
              content={part.output._meta["x402.payment-response"].transaction}
              className="size-6"
            />
          </div>
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

    if (toolName === "get_crypto_price" && data.priceUsd != null) {
      const changePositive = (data.change24h ?? 0) >= 0;
      return (
        <div className="p-3 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{data.token}</div>
          <div className="text-2xl font-bold font-mono">${Number(data.priceUsd).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</div>
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
