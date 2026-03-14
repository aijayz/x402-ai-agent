import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "x402 AI Agent",
  description:
    "AI agent with x402 crypto payment capabilities - pays for tools using USDC on Base",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      >
        <div className="size-full flex flex-col">
          <header className={`${geistSans.className} border-b border-gray-200`}>
            <div className="flex flex-row gap-2 text-lg font-medium items-center justify-center py-3">
              <Link
                href="https://github.com/vercel-labs/x402-ai-starter"
                className="underline"
                target="_blank"
              >
                x402 AI Agent
              </Link>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">
                AI + Crypto Payments on Base
              </span>
            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}