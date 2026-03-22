import Link from "next/link";
import { ClientProviders } from "@/components/client-providers";
import { WalletPill, CreditBadge } from "@/components/wallet-pill";
import { TopUpSheet } from "@/components/topup-sheet";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientProviders>
      <div className="size-full flex flex-col">
        <header className="relative overflow-hidden border-b border-border bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-background dark:to-gray-900">
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

          <div className="relative flex flex-row gap-4 items-center justify-between py-3 px-4">
            {/* Logo mark */}
            <Link
              href="/"
              className="flex items-center gap-2.5 group"
            >
              <div className="relative flex items-center justify-center">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 p-[1.5px]">
                  <div className="w-full h-full rounded-[6px] bg-background dark:bg-gray-900 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-transparent bg-clip-text bg-gradient-to-br from-blue-500 to-purple-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                </div>
                {/* Subtle glow on hover */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md" />
              </div>

              <div className="flex flex-col items-start">
                <span className="text-sm font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-200 dark:to-white bg-clip-text text-transparent">
                  Obol
                </span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 -mt-0.5 tracking-wide">
                  AI agent
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
              <span className="text-gray-300 dark:text-gray-600">on</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
                <span className="font-medium text-gray-700 dark:text-gray-300">Base</span>
              </div>
            </div>

            {/* Right: Credits + Wallet */}
            <div className="flex items-center gap-2">
              <CreditBadge />
              <WalletPill />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
        <TopUpSheet />
      </div>
    </ClientProviders>
  );
}
