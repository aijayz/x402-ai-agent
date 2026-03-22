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
import { useEffect, useState, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/ai-elements/response";
import { AlertCircle, RefreshCw, ArrowUpRight, Wallet, Sparkles, Shield, TrendingUp, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      "What are whales buying right now?",
      "Track large wallet movements on Ethereum",
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
];

// Parse [ACTION:xxx] markers from completed message text
function parseActions(text: string): { cleanText: string; actions: string[] } {
  const actions: string[] = [];
  const cleanText = text.replace(/\[ACTION:(\w+)\]/g, (_, action) => {
    actions.push(action);
    return "";
  });
  return { cleanText: cleanText.trim(), actions };
}

const ChatBotDemo = () => {
  const [input, setInput] = useState("");
  const [lastError, setLastError] = useState<Error | null>(null);
  const { walletAddress, connectWallet, setTopUpOpen, updateFromMetadata } = useWallet();

  const { messages, sendMessage, setMessages, status } = useChat({
    onError: (error) => {
      if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
        setLastError(new Error("RATE_LIMITED"));
      } else {
        setLastError(error);
      }
    },
  });

  // Update wallet context from message metadata
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    const meta = lastAssistant?.metadata as Record<string, unknown> | undefined;
    if (meta) {
      updateFromMetadata({
        budgetRemaining: meta.budgetRemaining as number | undefined,
        freeCallsRemaining: meta.freeCallsRemaining as number | undefined,
      });
    }
  }, [messages, updateFromMetadata]);

  const headers = walletAddress ? { "x-wallet-address": walletAddress } : undefined;

  // Connect wallet then auto-retry the last failed message
  const handleConnectAndRetry = useCallback(async () => {
    const address = await connectWallet();
    if (!address) return;

    // Extract the last user message text before removing it
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = lastUserMessage.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("") || "";
    if (!text) return;

    // Remove the failed user message so sendMessage doesn't duplicate it
    setMessages(prev => prev.filter(m => m.id !== lastUserMessage.id));
    setLastError(null);

    // Resend with wallet header — this adds the user message back + gets a response
    sendMessage({ text }, { headers: { "x-wallet-address": address } });
  }, [connectWallet, messages, sendMessage, setMessages]);

  const handleAction = useCallback((action: string) => {
    if (action === "topup") setTopUpOpen(true);
    else if (action === "connect_wallet") connectWallet();
  }, [setTopUpOpen, connectWallet]);

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

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input }, { headers });
      setInput("");
    }
  }, [input, sendMessage, headers]);

  const handlePromptClick = useCallback((prompt: string) => {
    sendMessage({ text: prompt }, { headers });
  }, [sendMessage, headers]);

  // Determine if a message is the currently-streaming one
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);
  const isLastAssistantMessage = (msgId: string) => lastAssistantId === msgId;

  return (
    <div className="w-full h-[calc(100vh-60px)] p-4 md:p-6 relative">
      <div className="flex flex-col h-full max-w-4xl mx-auto">
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
              </div>
            )}
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      const isStreaming = status === "streaming" && isLastAssistantMessage(message.id);
                      const { cleanText, actions } = isStreaming
                        ? { cleanText: part.text, actions: [] }
                        : parseActions(part.text);

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
            {status === "submitted" && <Loader />}
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
            {status === "error" && lastError?.message !== "RATE_LIMITED" && (
              lastError?.message?.includes("FREE_CALLS_EXHAUSTED") || lastError?.message?.includes("Free calls exhausted") ? (
                <div className="flex flex-col items-center justify-center p-6 mx-auto max-w-md">
                  <div className="flex flex-col items-center gap-4 p-6 bg-yellow-950/50 border border-yellow-800/50 rounded-lg text-center">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-yellow-200">Free calls used up</h3>
                      <p className="text-sm text-yellow-300">
                        You&apos;ve used your 2 free tool calls. Connect a wallet to get up to $0.50 in free credits.
                      </p>
                    </div>
                    {!walletAddress ? (
                      <button
                        onClick={handleConnectAndRetry}
                        className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
                      >
                        Connect Wallet
                      </button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
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
              )
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput onSubmit={handleSubmit} className="mt-4 shrink-0">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
            ref={(ref) => { if (ref) ref.focus(); }}
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
            <PromptInputSubmit disabled={!input} status={status} />
          </PromptInputToolbar>
        </PromptInput>

      </div>
    </div>
  );
};

export default ChatBotDemo;
