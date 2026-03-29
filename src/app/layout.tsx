import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.URL || "http://localhost:3000"
  ),
  title: {
    default: "x402 AI Agent",
    template: "%s | x402 AI Agent",
  },
  description: "AI agent that pays for intelligence via x402 micropayments on Base",
  openGraph: {
    siteName: "x402 AI Agent",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased h-full`}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
