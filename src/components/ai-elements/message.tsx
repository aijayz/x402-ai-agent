import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import type { HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-end justify-end gap-2 py-3",
      "animate-in slide-in-from-bottom-2 fade-in duration-300",
      from === "user" ? "is-user" : "is-assistant flex-row-reverse justify-end",
      "[&>div]:max-w-[80%]",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "flex flex-col gap-2 overflow-hidden rounded-2xl px-4 py-3 text-foreground text-sm",
      "shadow-sm border border-transparent",
      "group-[.is-user]:bg-gradient-to-br group-[.is-user]:from-primary group-[.is-user]:to-primary/90",
      "group-[.is-user]:text-primary-foreground group-[.is-user]:border-primary/20",
      "group-[.is-assistant]:bg-gradient-to-br group-[.is-assistant]:from-background group-[.is-assistant]:to-muted/50",
      "group-[.is-assistant]:text-foreground group-[.is-assistant]:border-muted/60",
      "transition-all duration-200 hover:shadow-md",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

