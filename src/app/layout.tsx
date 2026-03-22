import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Obol AI",
  description: "AI agent that pays for intelligence via x402 micropayments on Base",
  icons: { icon: "/icon.svg" },
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
        {children}
      </body>
    </html>
  );
}
