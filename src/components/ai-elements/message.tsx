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
      "[&>div]:max-w-[95%] [&>div]:sm:max-w-[80%]",
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

/** Date divider — Slack-style separator between messages on different dates */
export function DateDivider({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const isYesterday = (() => {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
  })();

  const label = isToday
    ? "Today"
    : isYesterday
      ? "Yesterday"
      : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex items-center gap-3 py-2 my-1">
      <span className="flex-1 h-px bg-border/40" />
      <span className="text-[11px] font-medium text-muted-foreground/60 select-none">
        {label}
      </span>
      <span className="flex-1 h-px bg-border/40" />
    </div>
  );
}
