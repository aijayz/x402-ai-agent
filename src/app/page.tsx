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
import { AlertCircle, RefreshCw, ArrowUpRight, Wallet, Check, Loader2, ExternalLink, Sparkles, Shield, TrendingUp, MessageCircle } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const [topUpSheetOpen, setTopUpSheetOpen] = useState(false);
  const [depositInfo, setDepositInfo] = useState<{ depositAddress: string; network: string } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(5);
  const [topUpStatus, setTopUpStatus] = useState<"idle" | "sending" | "confirming" | "done" | "error">("idle");
  const [topUpTxHash, setTopUpTxHash] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const { walletAddress, connectWallet, sendUsdc, refreshBalance, updateFromMetadata } = useWallet();

  const { messages, sendMessage, setMessages, status } = useChat({
    onError: (error) => {
      setLastError(error);
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

  const handleOpenTopUp = useCallback(async () => {
    if (!walletAddress) {
      await connectWallet();
      return;
    }
    // Reset state
    setTopUpStatus("idle");
    setTopUpTxHash(null);
    setTopUpError(null);
    setTopUpAmount(5);
    try {
      const res = await fetch("/api/credits/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const data = await res.json();
      setDepositInfo({ depositAddress: data.depositAddress, network: data.network });
      setTopUpSheetOpen(true);
    } catch {
      setTopUpError("Failed to fetch deposit info");
    }
  }, [walletAddress, connectWallet]);

  const handleSendTopUp = useCallback(async () => {
    if (!walletAddress || !depositInfo) return;
    setTopUpStatus("sending");
    setTopUpError(null);
    try {
      const txHash = await sendUsdc(depositInfo.depositAddress, topUpAmount);
      setTopUpTxHash(txHash);
      setTopUpStatus("confirming");

      // Confirm on server — polls until tx is mined
      const res = await fetch("/api/credits/topup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash }),
      });

      if (res.ok) {
        setTopUpStatus("done");
        await refreshBalance();
      } else {
        const data = await res.json();
        setTopUpError(data.error || "Failed to confirm transaction");
        setTopUpStatus("error");
      }
    } catch (err: unknown) {
      // User rejected in MetaMask or other error
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("User denied") || msg.includes("rejected")) {
        setTopUpStatus("idle"); // just go back, not an error
      } else {
        setTopUpError(msg);
        setTopUpStatus("error");
      }
    }
  }, [walletAddress, depositInfo, topUpAmount, sendUsdc, refreshBalance]);

  const handleAction = useCallback((action: string) => {
    if (action === "topup") handleOpenTopUp();
    else if (action === "connect_wallet") connectWallet();
  }, [handleOpenTopUp, connectWallet]);

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
                      return (
                        <Tool defaultOpen={true} key={`${message.id}-${i}`}>
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
                    return <SessionReceipt items={meta.spendEvents} />;
                  }
                  return null;
                })()}
              </Message>
            ))}
            {status === "submitted" && <Loader />}
            {status === "error" && (
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
                onClick={() => handlePromptClick("What tools and capabilities do you have? List them with costs.")}
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

        {/* Top-up Sheet */}
        <Sheet open={topUpSheetOpen} onOpenChange={setTopUpSheetOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Top Up Credits</SheetTitle>
              <SheetDescription>
                Add USDC credits on {depositInfo?.network === "base-sepolia" ? "Base Sepolia" : "Base"}.
              </SheetDescription>
            </SheetHeader>
            {depositInfo && (
              <div className="mt-6 space-y-5">
                {topUpStatus === "done" ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Check className="size-6 text-green-400" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-medium text-foreground">${topUpAmount.toFixed(2)} credited</p>
                      <p className="text-sm text-muted-foreground">Your credits have been updated.</p>
                    </div>
                    {topUpTxHash && (
                      <a
                        href={`${depositInfo.network === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org"}/tx/${topUpTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        View transaction <ExternalLink className="size-3" />
                      </a>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setTopUpSheetOpen(false)}>
                      Done
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Amount selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Amount (USDC)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 5, 10].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setTopUpAmount(amt)}
                            disabled={topUpStatus !== "idle"}
                            className={`py-2.5 rounded-lg text-sm font-medium border transition-colors
                              ${topUpAmount === amt
                                ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                                : "bg-muted/50 border-border text-muted-foreground hover:border-blue-500/30"
                              }`}
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Send button */}
                    <Button
                      onClick={handleSendTopUp}
                      disabled={topUpStatus !== "idle"}
                      className="w-full"
                    >
                      {topUpStatus === "sending" && (
                        <><Loader2 className="size-4 animate-spin mr-2" /> Approve in wallet...</>
                      )}
                      {topUpStatus === "confirming" && (
                        <><Loader2 className="size-4 animate-spin mr-2" /> Confirming on-chain...</>
                      )}
                      {topUpStatus === "idle" && `Send $${topUpAmount.toFixed(2)} USDC`}
                      {topUpStatus === "error" && "Try again"}
                    </Button>

                    {topUpError && (
                      <p className="text-sm text-red-400 text-center">{topUpError}</p>
                    )}

                    {/* Manual fallback */}
                    <div className="pt-3 border-t border-border space-y-2">
                      <p className="text-xs text-muted-foreground">Or send manually to:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-muted-foreground break-all flex-1">
                          {depositInfo.depositAddress}
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(depositInfo.depositAddress)}
                          className="shrink-0 px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default ChatBotDemo;
