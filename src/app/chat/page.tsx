"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/ai-elements/response";
import { AlertCircle, RefreshCw, ArrowUpRight, Wallet, Sparkles, Shield, TrendingUp, MessageCircle, Zap, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationSidebar } from "@/components/conversation-sidebar";
import { useConversations } from "@/hooks/use-conversations";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Loader } from "@/components/ai-elements/loader";
import { SessionReceipt } from "@/components/ai-elements/session-receipt";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { useWallet } from "@/components/wallet-provider";
import { CreditStatusBanner, type BannerState } from "@/components/credit-status-banner";

const capabilities = [
  {
    icon: TrendingUp,
    title: "Market Intelligence",
    prompts: [
      "What's the current price of Ethereum?",
      "Give me a morning crypto market briefing",
    ],
  },
  {
    icon: Shield,
    title: "DeFi Research",
    prompts: [
      "Is contract 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 safe?",
      "Analyze the top lending protocols on Base",
    ],
  },
  {
    icon: Sparkles,
    title: "Whale Tracking",
    prompts: [
      "Who are the biggest ETH holders on Base right now?",
      "What is the whale accumulation trend for USDC on Base?",
    ],
  },
  {
    icon: MessageCircle,
    title: "Social Sentiment",
    prompts: [
      "What's the narrative around Solana on Twitter?",
      "Summarize crypto sentiment from Farcaster",
    ],
  },
  {
    icon: PieChart,
    title: "Wallet Portfolio",
    prompts: [
      "Analyze wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "What's the risk profile of my wallet?",
    ],
  },
  {
    icon: Zap,
    title: "Token Alpha",
    prompts: [
      "Screen PEPE for alpha signals",
      "What tokens have the best holder quality right now?",
    ],
  },
];

// Parse [ACTION:xxx] markers from completed message text
function parseActions(text: string): { cleanText: string; actions: string[]; suggestions: string[] } {
  const actionSet = new Set<string>();
  const suggestions: string[] = [];
  let cleanText = text.replace(/\[ACTION:(\w+)\]/g, (_, action) => {
    actionSet.add(action);
    return "";
  });
  cleanText = cleanText.replace(/\[SUGGEST:([^\]]+)\]/g, (_, suggest) => {
    if (suggestions.length < 3) suggestions.push(suggest.trim());
    return "";
  });
  return { cleanText: cleanText.trim(), actions: [...actionSet], suggestions };
}

export function ChatPage() {
  const [input, setInput] = useState("");
  const [lastError, setLastError] = useState<Error | null>(null);
  const { walletAddress, balance, freeCallsRemaining, lastCreditEvent, clearCreditEvent, connectWallet, setTopUpOpen, updateFromMetadata, onTopUpCompleteRef, isRestoringSession } = useWallet();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRetryRef = useRef<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { messages, sendMessage, setMessages, status } = useChat({
    onError: (error) => {
      if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
        setLastError(new Error("RATE_LIMITED"));
      } else {
        if (error.message?.includes("FREE_CALLS_EXHAUSTED") || error.message?.includes("Free calls exhausted")) {
          const lastUserMsg = messages.filter(m => m.role === "user").pop();
          const text = lastUserMsg?.parts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ?.filter((p: any) => p.type === "text")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((p: any) => p.text)
            .join("") || "";
          if (text) pendingRetryRef.current = text;
        }
        setLastError(error);
      }
    },
  });

  const {
    conversations,
    activeId,
    loading: conversationsLoading,
    load: loadConversation,
    save: saveConversation,
    search: searchConversations,
    startNew: startNewConversation,
    remove: removeConversation,
  } = useConversations({ walletAddress });

  // Auto-save conversation when AI finishes responding
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "ready" && messages.length > 0 && walletAddress) {
      saveConversation(messages);
    }
    prevStatusRef.current = status;
  }, [status, messages, walletAddress, saveConversation]);

  const handleSelectConversation = useCallback(async (id: string) => {
    const loaded = await loadConversation(id);
    if (loaded) {
      setMessages(loaded);
      setLastError(null);
    }
  }, [loadConversation, setMessages]);

  const handleNewConversation = useCallback(() => {
    startNewConversation();
    setMessages([]);
    setLastError(null);
    textareaRef.current?.focus();
  }, [startNewConversation, setMessages]);

  // Track whether we just finished a live stream (vs loading historical messages).
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (status === "streaming") wasStreamingRef.current = true;
  }, [status]);

  // Update wallet context from message metadata — only after a live streaming response,
  // not when loading historical conversations (which contain stale budgetRemaining).
  useEffect(() => {
    if (status !== "ready" || !wasStreamingRef.current) return;
    wasStreamingRef.current = false;
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    const meta = lastAssistant?.metadata as Record<string, unknown> | undefined;
    if (meta) {
      updateFromMetadata({
        budgetRemaining: meta.budgetRemaining as number | undefined,
        freeCallsRemaining: meta.freeCallsRemaining as number | undefined,
      });
    }
  }, [messages, updateFromMetadata, status]);

  // Reset banner dismissed on new conversation turn
  useEffect(() => {
    if (status === "ready") setBannerDismissed(false);
  }, [status]);
  useEffect(() => {
    setBannerDismissed(false);
  }, [walletAddress]);

  const bannerState: BannerState = useMemo(() => {
    // Credit claim feedback takes highest priority
    if (lastCreditEvent?.type === "claimed" && lastCreditEvent.amountMicroUsdc > 0) {
      return { type: "credited" as const, amountUsdc: (lastCreditEvent.amountMicroUsdc / 1_000_000).toFixed(2) };
    }
    if (isRetrying) return "retrying";
    if (lastError?.message?.includes("FREE_CALLS_EXHAUSTED") || lastError?.message?.includes("Free calls exhausted")) {
      return walletAddress ? "exhausted-wallet" : "exhausted-anon";
    }
    if (bannerDismissed) return "hidden";
    if (!walletAddress && freeCallsRemaining === 1) return "low-anon";
    if (walletAddress && balance !== null && balance <= 0) return "exhausted-wallet";
    if (walletAddress && balance !== null && balance < 50000 && balance > 0) return "low-wallet";
    return "hidden";
  }, [lastCreditEvent, lastError, walletAddress, freeCallsRemaining, balance, bannerDismissed, isRetrying]);

  // Auto-dismiss credit claim banner after 5 seconds
  useEffect(() => {
    if (!lastCreditEvent) return;
    const timer = setTimeout(() => clearCreditEvent(), 5000);
    return () => clearTimeout(timer);
  }, [lastCreditEvent, clearCreditEvent]);

  // Clear retry state when streaming starts
  useEffect(() => {
    if (status === "streaming") {
      if (pendingRetryRef.current) pendingRetryRef.current = null;
      if (isRetrying) setIsRetrying(false);
    }
  }, [status, isRetrying]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const headers = walletAddress ? { "x-wallet-address": walletAddress } : undefined;

  const handleRetry = useCallback(() => {
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = lastUserMessage.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("") || "";
    if (!text) return;

    setMessages(prev => prev.filter(m => m.id !== lastUserMessage.id));
    setLastError(null);
    sendMessage({ text }, { headers });
  }, [messages, setMessages, sendMessage, headers]);

  const retryPendingMessage = useCallback((overrideAddress?: string) => {
    const text = pendingRetryRef.current;
    if (!text) return;
    setIsRetrying(true);
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (lastUserMessage) {
      setMessages(prev => prev.filter(m => m.id !== lastUserMessage.id));
    }
    setLastError(null);
    const addr = overrideAddress || walletAddress;
    const h = addr ? { "x-wallet-address": addr } : undefined;
    sendMessage({ text }, { headers: h });
  }, [messages, setMessages, sendMessage, walletAddress]);

  // Connect wallet then auto-retry the last failed message
  const handleConnectAndRetry = useCallback(async () => {
    const address = await connectWallet();
    if (!address) return;
    retryPendingMessage(address);
  }, [connectWallet, retryPendingMessage]);

  const handleAction = useCallback((action: string) => {
    if (action === "topup") setTopUpOpen(true);
    else if (action === "connect_wallet") connectWallet();
  }, [setTopUpOpen, connectWallet]);

  useEffect(() => {
    onTopUpCompleteRef.current = () => retryPendingMessage();
    return () => { onTopUpCompleteRef.current = null; };
  }, [retryPendingMessage, onTopUpCompleteRef]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isRestoringSession) {
      sendMessage({ text: input }, { headers });
      setInput("");
    }
  }, [input, sendMessage, headers, isRestoringSession]);

  const handlePromptClick = useCallback((prompt: string) => {
    if (isRestoringSession) return;
    sendMessage({ text: prompt }, { headers });
  }, [sendMessage, headers, isRestoringSession]);

  // Determine if a message is the currently-streaming one
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);
  const isLastAssistantMessage = (msgId: string) => lastAssistantId === msgId;

  return (
    <div className="w-full h-[calc(100vh-60px)] flex relative">
      {walletAddress && (
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          loading={conversationsLoading}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={removeConversation}
          onSearch={searchConversations}
        />
      )}
      <div className="flex-1 flex flex-col h-full max-w-4xl mx-auto p-4 md:p-6">
        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="min-h-full flex flex-col justify-end">
            {messages.length === 0 && status === "ready" && (
              <div className="flex flex-col items-center justify-center py-10 animate-in fade-in duration-500">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  What can I help you with?
                </h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-md text-center">
                  Ask anything about crypto. I&apos;ll orchestrate the right tools and handle payments automatically.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                  {capabilities.map((cap) => (
                    <div
                      key={cap.title}
                      className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <cap.icon className="size-4 text-muted-foreground" />
                        {cap.title}
                      </div>
                      <div className="space-y-1.5">
                        {cap.prompts.map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => handlePromptClick(prompt)}
                            className="block w-full text-left text-xs text-muted-foreground hover:text-foreground
                              px-2.5 py-1.5 rounded-md hover:bg-muted/80 transition-colors truncate"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {!walletAddress && (
                  <button
                    onClick={() => connectWallet()}
                    className="group flex items-center gap-3 mt-8 w-full max-w-sm mx-auto animate-in fade-in duration-700"
                  >
                    <span className="flex-1 h-px border-t border-dashed border-muted-foreground/15 group-hover:border-muted-foreground/30 transition-colors" />
                    <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground/40 group-hover:text-blue-400/70 transition-colors">
                      <Wallet className="size-3" />
                      connect wallet to save history
                    </span>
                    <span className="flex-1 h-px border-t border-dashed border-muted-foreground/15 group-hover:border-muted-foreground/30 transition-colors" />
                  </button>
                )}
              </div>
            )}
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      const isStreaming = status === "streaming" && isLastAssistantMessage(message.id);
                      const parsed = isStreaming
                        ? { cleanText: part.text, actions: [] as string[], suggestions: [] as string[] }
                        : parseActions(part.text);
                      // Strip connect_wallet action if user already has a wallet
                      const actions = walletAddress
                        ? parsed.actions.filter(a => a !== "connect_wallet")
                        : parsed.actions;
                      const { cleanText, suggestions } = parsed;

                      return (
                        <div key={`${message.id}-${i}`}>
                          <Response>{cleanText}</Response>
                          {actions.length > 0 && (
                            <div className="flex gap-2 mt-3">
                              {actions.map((action) => (
                                <button
                                  key={action}
                                  onClick={() => handleAction(action)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                                    bg-gradient-to-r from-blue-500/20 to-cyan-400/20
                                    border border-blue-500/30 hover:border-blue-500/50
                                    text-foreground hover:from-blue-500/30 hover:to-cyan-400/30
                                    transition-all duration-200"
                                >
                                  {action === "topup" && <><ArrowUpRight className="size-3.5" /> Top Up</>}
                                  {action === "connect_wallet" && <><Wallet className="size-3.5" /> Connect Wallet</>}
                                </button>
                              ))}
                            </div>
                          )}
                          {suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {suggestions.map((suggest) => (
                                <button
                                  key={suggest}
                                  onClick={() => handlePromptClick(suggest)}
                                  className="px-3 py-1.5 rounded-full text-xs font-medium
                                    bg-muted/50 border border-border
                                    text-muted-foreground hover:text-foreground hover:bg-muted/80 hover:border-muted-foreground/30
                                    transition-all duration-200"
                                >
                                  {suggest}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    } else if (part.type === "reasoning") {
                      return (
                        <Reasoning key={`${message.id}-${i}`} className="w-full" isStreaming={status === "streaming"}>
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    } else if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
                      // Hide the 402 payment-negotiation tool call — only show the successful retry
                      const toolOutput = (part as any).output as { isError?: boolean; content?: Array<{ text: string }> } | undefined;
                      if (toolOutput?.isError) {
                        const errorText = toolOutput.content?.map(c => c.text).join("") ?? "";
                        if (errorText.includes("x402Version") || errorText.includes("payment is required")) {
                          return null;
                        }
                      }
                      return (
                        <Tool defaultOpen={false} key={`${message.id}-${i}`}>
                          {/* @ts-expect-error: ToolHeader expects ToolUIPart but part may be DynamicToolUIPart */}
                          <ToolHeader part={part} />
                          <ToolContent>
                            {/* @ts-expect-error: part.input exists at runtime but not in union type */}
                            <ToolInput input={part.input} />
                            {/* @ts-expect-error: part is a union type that ToolOutput handles */}
                            <ToolOutput part={part} network={message.metadata?.network} />
                          </ToolContent>
                        </Tool>
                      );
                    } else {
                      return null;
                    }
                  })}
                </MessageContent>
                {message.role === "assistant" && (() => {
                  const meta = message.metadata as { spendEvents?: Array<{ toolName: string; amountUsdc: number }> } | undefined;
                  if (meta?.spendEvents?.length) {
                    return <SessionReceipt items={meta.spendEvents} isAnonymous={!walletAddress} />;
                  }
                  return null;
                })()}
              </Message>
            ))}
            {status === "submitted" && !isRetrying && <Loader />}
            {status === "error" && lastError?.message === "RATE_LIMITED" && (
              <div className="flex flex-col items-center justify-center p-6 mx-auto max-w-md">
                <div className="flex flex-col items-center gap-4 p-6 bg-amber-950/50 border border-amber-800/50 rounded-lg text-center">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-amber-200">Too many requests</h3>
                    <p className="text-sm text-amber-300">
                      You&apos;re sending messages too quickly. Please wait a moment and try again.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {status === "error" && lastError?.message !== "RATE_LIMITED" && !lastError?.message?.includes("FREE_CALLS_EXHAUSTED") && !lastError?.message?.includes("Free calls exhausted") && (
              <div className="flex flex-col items-center justify-center p-6 mx-auto max-w-md">
                <div className="flex flex-col items-center gap-4 p-6 bg-red-950/50 border border-red-800/50 rounded-lg text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-red-900/50 rounded-full">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-red-200">Something went wrong</h3>
                    <p className="text-sm text-red-300">
                      {lastError?.message || "An unexpected error occurred. Please try again."}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Try again
                  </Button>
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {!walletAddress && messages.length > 0 && bannerState === "hidden" && (
          <button
            onClick={() => connectWallet()}
            className="group flex items-center gap-3 py-1.5 w-full max-w-xs mx-auto"
          >
            <span className="flex-1 h-px border-t border-dashed border-muted-foreground/15 group-hover:border-muted-foreground/30 transition-colors" />
            <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground/40 group-hover:text-blue-400/70 transition-colors">
              <Wallet className="size-3" />
              connect wallet to save history
            </span>
            <span className="flex-1 h-px border-t border-dashed border-muted-foreground/15 group-hover:border-muted-foreground/30 transition-colors" />
          </button>
        )}

        <CreditStatusBanner
          state={bannerState}
          onConnectWallet={handleConnectAndRetry}
          onTopUp={() => setTopUpOpen(true)}
          onDismiss={() => { setBannerDismissed(true); clearCreditEvent(); }}
        />

        <PromptInput onSubmit={handleSubmit} className="mt-4 shrink-0">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
            ref={textareaRef}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <button
                onClick={() => handlePromptClick("Give me a quick overview of what you can do.")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground
                  hover:text-foreground hover:bg-muted/80 transition-colors border border-transparent hover:border-border"
                title="Explore available tools"
              >
                <Sparkles className="size-3" />
                <span>Explore</span>
              </button>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input || isRestoringSession} status={status} />
          </PromptInputToolbar>
        </PromptInput>

      </div>
    </div>
  );
};

export default ChatPage;
