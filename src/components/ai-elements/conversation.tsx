"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn(
      "relative overflow-y-auto scroll-smooth",
      "bg-gradient-to-b from-gray-50/50 to-white/80 dark:from-gray-900/50 dark:to-background/80",
      "rounded-2xl border border-gray-200/50 dark:border-gray-800/50",
      "shadow-inner backdrop-blur-sm",
      className,
    )}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("p-4 md:p-6", className)}
    {...props}
  />
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-6 left-[50%] -translate-x-[50%] rounded-full",
          "bg-white/90 dark:bg-gray-800/90 backdrop-blur-md",
          "border border-gray-200/50 dark:border-gray-700/50",
          "shadow-lg shadow-gray-200/20 dark:shadow-gray-900/40",
          "hover:bg-white dark:hover:bg-gray-800",
          "transition-all duration-200 ease-out",
          "hover:scale-105 active:scale-95",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
