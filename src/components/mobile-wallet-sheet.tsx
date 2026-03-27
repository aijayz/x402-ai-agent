"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface MobileWalletSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCoinbaseWallet: () => void;
}

function getMetaMaskDeepLink(): string {
  // Strip protocol — MetaMask deep link expects bare host+path
  const url = window.location.href.replace(/^https?:\/\//, "");
  return `https://metamask.app.link/dapp/${url}`;
}

export function MobileWalletSheet({
  open,
  onOpenChange,
  onCoinbaseWallet,
}: MobileWalletSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="rounded-t-2xl px-5 pb-8 pt-3"
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <SheetHeader className="p-0 mb-5">
          <SheetTitle className="text-lg">Connect Wallet</SheetTitle>
          <SheetDescription className="text-sm">
            Choose how you&apos;d like to connect
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3">
          {/* Option 1: MetaMask deep link */}
          <a
            href={open ? getMetaMaskDeepLink() : "#"}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors active:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F6851B]/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21.3 2L13.1 8.1l1.5-3.6L21.3 2z" fill="#E2761B" stroke="#E2761B" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.7 2l8.1 6.2-1.4-3.7L2.7 2zM18.4 16.8l-2.2 3.3 4.6 1.3 1.3-4.5-3.7-.1zM1.9 16.9l1.3 4.5 4.6-1.3-2.2-3.3-3.7.1z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 10.5L6.3 12.4l4.6.2-.2-4.9-3.2 2.8zM16.5 10.5l-3.2-2.9-.1 5 4.5-.2-1.2-1.9zM7.8 20.1l2.8-1.3-2.4-1.9-.4 3.2zM13.4 18.8l2.8 1.3-.4-3.2-2.4 1.9z" fill="#E4761B" stroke="#E4761B" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16.2 20.1l-2.8-1.3.2 1.8v.8l2.6-1.3zM7.8 20.1l2.6 1.3v-.8l.2-1.8-2.8 1.3z" fill="#D7C1B3" stroke="#D7C1B3" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.5 15.3l-2.3-.7 1.6-.7.7 1.4zM13.5 15.3l.7-1.4 1.6.7-2.3.7z" fill="#233447" stroke="#233447" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.8 20.1l.4-3.3-2.6.1 2.2 3.2zM15.8 16.8l.4 3.3 2.2-3.2-2.6-.1zM17.7 12.4l-4.5.2.4 2.7.7-1.4 1.6.7 1.8-2.2zM8.2 14.6l1.6-.7.7 1.4.4-2.7-4.6-.2 1.9 2.2z" fill="#CD6116" stroke="#CD6116" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.3 12.4l2 3.8-.1-1.6-1.9-2.2zM15.9 14.6l-.1 1.6 2-3.8-1.9 2.2zM10.9 12.6l-.4 2.7.5 2.6.1-3.5-.2-1.8zM13.2 12.6l-.2 1.8.1 3.5.5-2.6-.4-2.7z" fill="#E4751F" stroke="#E4751F" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.6 15.3l-.5 2.6.4.3 2.4-1.9.1-1.6-2.4.6zM8.2 14.6l.1 1.6 2.4 1.9.3-.3-.5-2.6-2.3-.6z" fill="#F6851B" stroke="#F6851B" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.7 21.4v-.8l-.2-.2h-3l-.2.2v.8l-2.5-1.3.9.7 1.8 1.2h3.1l1.8-1.2.9-.7-2.6 1.3z" fill="#C0AD9E" stroke="#C0AD9E" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.4 18.8l-.4-.3h-2l-.3.3-.2 1.8.2-.2h3l.2.2-.5-1.8z" fill="#161616" stroke="#161616" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21.7 8.5l.7-3.3L21.3 2l-7.9 5.9 3.1 2.6 4.3 1.3.9-1.1-.4-.3.7-.6-.5-.4.6-.5-.4-.4zM1.6 5.2l.7 3.3-.5.4.7.5-.5.4.7.6-.4.3.9 1.1 4.3-1.3 3.1-2.6L2.7 2 1.6 5.2z" fill="#763D16" stroke="#763D16" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.8 11.8l-4.3-1.3 1.2 1.9-2 3.8 2.7-.1h3.7l-1.3-4.3zM7.5 10.5L3.2 11.8 1.9 16.1h3.7l2.7.1-2-3.8 1.2-1.9zM13.2 12.6l.3-4.7 1.1-3.4H9.4l1.2 3.4.2 4.7.1 1.8v3.5h2l.1-3.5-.1-1.8h.3z" fill="#F6851B" stroke="#F6851B" strokeWidth="0.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">Open in MetaMask</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Opens this page in MetaMask&apos;s browser
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>

          {/* Option 2: Coinbase Wallet */}
          <button
            type="button"
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors active:bg-muted"
            onClick={onCoinbaseWallet}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0052FF]/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="5.4" fill="#0052FF" />
                <path d="M12 4.8a7.2 7.2 0 100 14.4 7.2 7.2 0 000-14.4zm-2.4 5.4a.6.6 0 01.6-.6h3.6a.6.6 0 01.6.6v3.6a.6.6 0 01-.6.6h-3.6a.6.6 0 01-.6-.6v-3.6z" fill="white" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">Coinbase Wallet</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                No app needed — one-time setup with email + Face ID
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Dismiss hint */}
        <p className="mt-4 text-center text-xs text-muted-foreground/60">
          Swipe down to dismiss
        </p>
      </SheetContent>
    </Sheet>
  );
}
