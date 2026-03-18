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
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/ai-elements/response";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Loader } from "@/components/ai-elements/loader";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

const models = [
  {
    name: "Gemini 2.0 Flash",
    value: "gemini-2.0-flash",
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
  "Ask a question": "What is blockchain technology?",
  "Use a free tool": "Get a random number between 1 and 10.",
  "Check my balance": "What is my USDC balance?",
  "Use a paid tool ($0.01)": "Get a premium random number between 1 and 100.",
};

const ChatBotDemo = () => {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(models[0].value);
  const [lastError, setLastError] = useState<Error | null>(null);
  const { messages, sendMessage, status } = useChat({
    onError: (error) => {
      // Store error for UI display - logging handled by error boundary in production
      setLastError(error);
    },
  });

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
      sendMessage({ text }, { body: { model } });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(
        { text: input },
        {
          body: {
            model: model,
          },
        }
      );
      setInput("");
    }
  };

  const handleSuggestionClick = (suggestion: keyof typeof suggestions) => {
    sendMessage(
      { text: suggestions[suggestion] },
      {
        body: {
          model: model,
        },
      }
    );
  };

  return (
    <div className="w-full h-[calc(100vh-60px)] p-4 md:p-6 relative">
      <div className="flex flex-col h-full max-w-4xl mx-auto">
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
              </Message>
            ))}
            {status === "submitted" && <Loader />}
            {status === "error" && (
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                  </Button>
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

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
