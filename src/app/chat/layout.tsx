import Link from "next/link";
import { ClientProviders } from "@/components/client-providers";
import { WalletPill, CreditBadge } from "@/components/wallet-pill";
import { TopUpSheet } from "@/components/topup-sheet";
import { SpendHistorySheet } from "@/components/spend-history-sheet";
import { ErrorBoundary } from "@/components/error-boundary";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientProviders>
      <div className="size-full flex flex-col">
        <header className="relative border-b border-border bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-background dark:to-gray-900">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
                backgroundSize: "24px 24px",
              }}
            />
          </div>

          <div className="relative flex flex-row gap-2 sm:gap-4 items-center justify-between py-3 px-3 sm:px-4 min-w-0 overflow-hidden">
            {/* Logo mark */}
            <Link
              href="/"
              className="flex items-center gap-2.5 group"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-200 dark:to-white bg-clip-text text-transparent">
                  x402 Agent
                </span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 -mt-0.5 tracking-wide">
                  AI · USDC · x402
                </span>
              </div>
            </Link>

            {/* Center: Tagline */}
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 animate-pulse" />
                <span>AI</span>
              </div>
              <span className="text-gray-300 dark:text-gray-600">×</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-400" />
                <span>USDC</span>
              </div>
              <span className="text-gray-300 dark:text-gray-600">×</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
                <span className="font-medium text-gray-700 dark:text-gray-300">Multi-chain</span>
              </div>
            </div>

            {/* Right: Credits + Wallet */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <CreditBadge />
              <WalletPill />
            </div>
          </div>
        </header>

        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <TopUpSheet />
        <SpendHistorySheet />
      </div>
    </ClientProviders>
  );
}
