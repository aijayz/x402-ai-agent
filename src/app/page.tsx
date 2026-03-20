"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/ai-elements/response";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { AlertCircle, CreditCardIcon, RefreshCw } from "lucide-react";
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

function CostConfirmBanner({ toolName, estimatedCost, onConfirm, onCancel }: {
  toolName: string;
  estimatedCost: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [countdown, setCountdown] = useState(estimatedCost <= 0.50 ? 2 : null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { onConfirm(); return; }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onConfirm]);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm">
      <span>
        <strong>{toolName.replace(/_/g, " ")}</strong> will cost ~${estimatedCost.toFixed(2)}
        {countdown !== null && <span className="text-muted-foreground"> (proceeding in {countdown}s)</span>}
      </span>
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1 rounded border text-xs">Cancel</button>
        <button onClick={onConfirm} className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs">
          Proceed
        </button>
      </div>
    </div>
  );
}

const models = [
  {
    name: "Gemini 2.5 Flash",
    value: "gemini-2.5-flash",
  },
  {
    name: "DeepSeek Chat",
    value: "deepseek-chat",
  },
  {
    name: "DeepSeek Reasoner",
    value: "deepseek-reasoner",
  },
];
const suggestions = {
  "Is this token safe?": "Analyze the safety of contract 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  "Whale activity": "What are whales buying right now?",
  "Crypto sentiment": "What's the narrative around Solana on Twitter and Farcaster?",
  "Check price ($0.01)": "What's the current price of Ethereum?",
};

const ChatBotDemo = () => {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(models[0].value);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [budgetRemaining, setBudgetRemaining] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [pendingCostConfirm, setPendingCostConfirm] = useState<{
    toolName: string;
    estimatedCost: number;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const { messages, sendMessage, status } = useChat({
    onError: (error) => {
      // Store error for UI display - logging handled by error boundary in production
      setLastError(error);
    },
  });

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    const meta = lastAssistant?.metadata as Record<string, unknown> | undefined;
    if (meta?.budgetRemaining != null) {
      setBudgetRemaining(Number(meta.budgetRemaining));
    }
  }, [messages]);

  async function connectWallet() {
    if (typeof window.ethereum === "undefined") {
      alert("Please install MetaMask or another EVM wallet");
      return;
    }
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    }) as string[];
    const address = accounts[0];
    setWalletAddress(address);

    // Claim free credits
    const res = await fetch("/api/credits/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    });
    const data = await res.json();
    setCreditBalance(data.balance ?? 0);
  }

  function checkForCostAnnouncement(text: string) {
    const costMatch = text.match(/(?:~\$|will cost[^$]*\$|estimated cost[^$]*\$|costs?\s+\$)(\d+\.?\d*)/i);
    if (!costMatch) return;
    const estimatedCost = parseFloat(costMatch[1]);
    if (estimatedCost < 0.10) return;

    setPendingCostConfirm({
      toolName: "research tool",
      estimatedCost,
      onConfirm: () => setPendingCostConfirm(null),
      onCancel: () => setPendingCostConfirm(null),
    });
  }

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAssistant || status !== "streaming") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textParts = lastAssistant.parts.filter((p: any) => p.type === "text");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullText = textParts.map((p: any) => p.text).join("");
    checkForCostAnnouncement(fullText);
  }, [messages, status]);

  const handleRetry = () => {
    setLastError(null);
    // In AI SDK v6, we can resend the last message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = lastUserMessage.parts
        ?.filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('') || '';
      sendMessage({ text }, { body: { model }, headers: walletAddress ? { "x-wallet-address": walletAddress } : undefined });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(
        { text: input },
        { body: { model }, headers: walletAddress ? { "x-wallet-address": walletAddress } : undefined }
      );
      setInput("");
    }
  };

  const handleSuggestionClick = (suggestion: keyof typeof suggestions) => {
    sendMessage(
      { text: suggestions[suggestion] },
      { body: { model }, headers: walletAddress ? { "x-wallet-address": walletAddress } : undefined }
    );
  };

  return (
    <div className="w-full h-[calc(100vh-60px)] p-4 md:p-6 relative">
      <div className="flex flex-col h-full max-w-4xl mx-auto">
        <div className="flex justify-end mb-2">
          {walletAddress ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              {creditBalance !== null && (
                <span className="text-muted-foreground">${(creditBalance / 1_000_000).toFixed(2)}</span>
              )}
            </div>
          ) : (
            <button onClick={connectWallet} className="text-sm px-3 py-1 rounded border">
              Connect Wallet
            </button>
          )}
        </div>
        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="min-h-full flex flex-col justify-end">
            {messages.length === 0 && status === "ready" && (
              <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-500">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-amber-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                    {/* Neural network + lightning bolt (AI + fast payments) */}
                    <svg
                      className="w-10 h-10 text-white"
                      viewBox="0 0 32 32"
                      fill="none"
                    >
                      {/* Neural nodes */}
                      <circle cx="10" cy="10" r="2.5" fill="white" fillOpacity="0.9"/>
                      <circle cx="22" cy="10" r="2.5" fill="white" fillOpacity="0.9"/>
                      <circle cx="16" cy="18" r="2.5" fill="white" fillOpacity="0.9"/>
                      <circle cx="16" cy="26" r="2" fill="white" fillOpacity="0.7"/>
                      {/* Connections */}
                      <path d="M10 10h6M10 10l4 6M22 10l-4 6M16 18v6" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                      {/* Lightning bolt overlay */}
                      <path d="M18 6l-4 8h4l-2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Welcome to x402 AI Agent
                </h2>
                <p className="text-muted-foreground max-w-sm mb-6">
                  An AI agent that discovers, budgets, and pays for external API services using USDC on Base blockchain.
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Free tools available
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    Paid tools supported
                  </div>
                </div>
              </div>
            )}
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <Response key={`${message.id}-${i}`}>
                          {part.text}
                        </Response>
                      );
                    } else if (part.type === "reasoning") {
                      return (
                        <Reasoning
                          key={`${message.id}-${i}`}
                          className="w-full"
                          isStreaming={status === "streaming"}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    } else if (
                      part.type === "dynamic-tool" ||
                      part.type.startsWith("tool-")
                    ) {
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
                  const meta = message.metadata as { spendEvents?: Array<{ toolName: string; amountUsdc: number }>; budgetRemaining?: number } | undefined;
                  if (meta?.spendEvents?.length) {
                    return <SessionReceipt items={meta.spendEvents} balanceRemaining={meta.budgetRemaining ?? 0} />;
                  }
                  return null;
                })()}
              </Message>
            ))}
            {status === "submitted" && <Loader />}
            {status === "error" && (
              lastError?.message?.includes("FREE_CALLS_EXHAUSTED") || lastError?.message?.includes("Free calls exhausted") ? (
                <div className="flex flex-col items-center justify-center p-6 mx-auto max-w-md">
                  <div className="flex flex-col items-center gap-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-yellow-900">Free calls used up</h3>
                      <p className="text-sm text-yellow-700">
                        You&apos;ve used your 2 free tool calls. Connect a wallet to get up to $0.50 in free credits.
                      </p>
                    </div>
                    {!walletAddress && (
                      <button onClick={connectWallet} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm">
                        Connect Wallet
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 mx-auto max-w-md">
                  <div className="flex flex-col items-center gap-4 p-6 bg-red-50 border border-red-200 rounded-lg text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-red-900">Something went wrong</h3>
                      <p className="text-sm text-red-700">
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

        {messages.length === 0 && (
          <Suggestions className="justify-center">
            {Object.keys(suggestions).map((suggestion) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                onClick={() =>
                  handleSuggestionClick(suggestion as keyof typeof suggestions)
                }
                variant="outline"
                size="sm"
              />
            ))}
          </Suggestions>
        )}

        {pendingCostConfirm && <CostConfirmBanner {...pendingCostConfirm} />}
        <PromptInput onSubmit={handleSubmit} className="mt-4 shrink-0">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
            ref={(ref) => {
              if (ref) {
                ref.focus();
              }
            }}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              {budgetRemaining !== null && (
                <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                  <CreditCardIcon className="size-3" />
                  <span className="font-mono">${budgetRemaining.toFixed(2)}</span>
                  <span>remaining</span>
                </div>
              )}
              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem
                      key={model.value}
                      value={model.value}
                    >
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default ChatBotDemo;
