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
const PAID_TOOLS = ["premium_random", "premium_analysis"];

const isPaidTool = (toolName: string) => PAID_TOOLS.includes(toolName);

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
  const renderResult = renderRawOutput({ output: part.output });
  const state =
    rawState === "output-available" && part.type === "dynamic-tool"
      ? mapRenderResultTypeToState(renderResult.type)
      : rawState;

  const toolname =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);

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
        {getStatusBadge(state)}
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
  const renderResult =
    part.type === "dynamic-tool"
      ? renderRawOutput({ output: part.output })
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
      {/* @ts-expect-error */}
      {part.output?._meta?.["x402.payment-response"] && (
        <div className="mt-3 pt-3 border-t border-muted/40">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              <ZapIcon className="size-3" />
              Payment Successful
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

function renderRawOutput({
  output,
}: {
  output: ToolUIPart["output"];
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
    return {
      type: "error",
      content: parseResult.data.content.map((item) => item.text).join(""),
    };
  }
  return {
    type: "success",
    content: (
      <Response>
        {parseResult.data.content.map((item) => item.text).join("")}
      </Response>
    ),
  };
}
