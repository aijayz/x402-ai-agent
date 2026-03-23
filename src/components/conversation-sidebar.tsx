"use client";

import { useState, useCallback } from "react";
import { MessageSquare, Plus, Trash2, PanelLeftClose, PanelLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ConversationSummary } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Shared sidebar content used in both inline and sheet modes */
function SidebarContent({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: ConversationSidebarProps & { onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            History
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-7 text-muted-foreground hover:text-foreground"
            title="Close sidebar"
          >
            <PanelLeftClose className="size-3.5" />
          </Button>
        )}
      </div>

      {/* New Chat button */}
      <div className="px-3 pb-3">
        <button
          onClick={() => { onNew(); onClose?.(); }}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium
            bg-gradient-to-r from-blue-500/20 via-cyan-400/15 to-blue-500/20
            border border-blue-500/30 hover:border-blue-400/50
            text-blue-200 hover:text-blue-100
            hover:from-blue-500/30 hover:via-cyan-400/25 hover:to-blue-500/30
            transition-all duration-200 shadow-sm shadow-blue-500/5 hover:shadow-blue-500/15"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-3" />

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {loading && conversations.length === 0 && (
          <div className="px-4 py-10 text-center">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <div className="size-1 rounded-full bg-blue-400 animate-pulse" />
              Loading conversations...
            </div>
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="px-4 py-10 text-center space-y-2">
            <MessageSquare className="size-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground/60">
              Your conversations will appear here
            </p>
          </div>
        )}
        <div className="p-2 space-y-0.5">
          {conversations.map((conv) => {
            const isActive = activeId === conv.id;
            return (
              <div
                key={conv.id}
                className={cn(
                  "group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150",
                  isActive
                    ? "bg-blue-500/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                onClick={() => { onSelect(conv.id); onClose?.(); }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-gradient-to-b from-blue-400 to-cyan-400" />
                )}
                <MessageSquare className={cn(
                  "size-3.5 mt-0.5 shrink-0 transition-colors",
                  isActive ? "text-blue-400" : ""
                )} />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-[13px] font-medium truncate leading-tight",
                    isActive && "text-foreground"
                  )}>
                    {conv.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground/70 mt-1">
                    {formatRelativeTime(conv.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/15 hover:text-red-400 transition-all mt-0.5"
                  title="Delete conversation"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMobileSelect = useCallback((id: string) => {
    props.onSelect(id);
    setMobileOpen(false);
  }, [props.onSelect]);

  const handleMobileNew = useCallback(() => {
    props.onNew();
    setMobileOpen(false);
  }, [props.onNew]);

  return (
    <>
      {/* Mobile: toggle button in top-left + Sheet overlay */}
      <div className="md:hidden flex flex-col items-center pt-3 px-1.5 gap-1.5 border-r border-border bg-muted/20">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted/80"
          title="Open history"
        >
          <PanelLeft className="size-4" />
        </Button>
        <button
          onClick={props.onNew}
          className="flex items-center justify-center size-9 rounded-lg
            bg-gradient-to-b from-blue-500/25 to-blue-600/20
            border border-blue-500/40 hover:border-blue-400/60
            text-blue-300 hover:text-blue-200
            transition-all duration-200 hover:shadow-md hover:shadow-blue-500/10"
          title="New chat"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-80 p-0">
          <SidebarContent
            {...props}
            onSelect={handleMobileSelect}
            onNew={handleMobileNew}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop: inline sidebar */}
      <div className="hidden md:flex">
        {!desktopOpen ? (
          <div className="flex flex-col items-center pt-3 px-1.5 gap-1.5 border-r border-border bg-muted/20">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDesktopOpen(true)}
              className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted/80"
              title="Open sidebar"
            >
              <PanelLeft className="size-4" />
            </Button>
            <button
              onClick={props.onNew}
              className="flex items-center justify-center size-9 rounded-lg
                bg-gradient-to-b from-blue-500/25 to-blue-600/20
                border border-blue-500/40 hover:border-blue-400/60
                text-blue-300 hover:text-blue-200
                transition-all duration-200 hover:shadow-md hover:shadow-blue-500/10"
              title="New chat"
            >
              <Plus className="size-4" />
            </button>
          </div>
        ) : (
          <div className="w-72 shrink-0 flex flex-col border-r border-border bg-gradient-to-b from-muted/40 via-background to-background">
            <SidebarContent
              {...props}
              onClose={() => setDesktopOpen(false)}
            />
          </div>
        )}
      </div>
    </>
  );
}
