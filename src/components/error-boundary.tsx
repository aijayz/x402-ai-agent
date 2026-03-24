"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-8 mx-auto max-w-md min-h-[300px]">
          <div className="flex flex-col items-center gap-4 p-6 bg-red-950/50 border border-red-800/50 rounded-lg text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-red-900/50 rounded-full">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-red-200">Something went wrong</h3>
              <p className="text-sm text-red-300">
                The chat interface encountered an error. Your conversation data is safe.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
