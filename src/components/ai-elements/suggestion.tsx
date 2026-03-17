"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LightbulbIcon, SparklesIcon, WalletIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <ScrollArea className="w-full overflow-x-auto whitespace-nowrap" {...props}>
    <div className={cn("flex w-max flex-nowrap items-center gap-2 py-2", className)}>
      {children}
    </div>
    <ScrollBar className="hidden" orientation="horizontal" />
  </ScrollArea>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion);
  };

  // Determine icon based on suggestion text
  const getIcon = () => {
    if (suggestion.toLowerCase().includes("balance") || suggestion.toLowerCase().includes("usdc")) {
      return <WalletIcon className="size-3.5" />;
    }
    if (suggestion.toLowerCase().includes("paid") || suggestion.toLowerCase().includes("$")) {
      return <SparklesIcon className="size-3.5" />;
    }
    return <LightbulbIcon className="size-3.5" />;
  };

  return (
    <Button
      className={cn(
        "cursor-pointer rounded-full px-4 gap-2",
        "border-muted-foreground/20 hover:border-muted-foreground/40",
        "bg-background/80 hover:bg-background",
        "backdrop-blur-sm shadow-sm hover:shadow",
        "transition-all duration-200",
        "hover:scale-[1.02] active:scale-[0.98]",
        className,
      )}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {getIcon()}
      {children || suggestion}
    </Button>
  );
};
