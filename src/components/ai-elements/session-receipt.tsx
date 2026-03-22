"use client";

import { ZapIcon } from "lucide-react";

interface ReceiptItem {
  toolName: string;
  amountUsdc: number;
}

interface SessionReceiptProps {
  items: ReceiptItem[];
  isAnonymous?: boolean;
}

export function SessionReceipt({ items, isAnonymous }: SessionReceiptProps) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.amountUsdc, 0);

  if (isAnonymous) {
    // Informational: show that paid tools were used, nudge wallet connect
    return (
      <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/30 border border-amber-800/30 text-xs text-amber-300">
        <ZapIcon className="size-3" />
        <span>
          {items.length === 1
            ? `${items[0].toolName.replace(/_/g, " ")} · $${total.toFixed(2)}`
            : `${items.length} paid tools · $${total.toFixed(2)}`}
        </span>
        <span className="text-amber-400/60">via x402</span>
      </div>
    );
  }

  // Transactional: wallet connected, show actual costs
  return (
    <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs font-mono space-y-1">
      <div className="text-muted-foreground mb-1">Cost this turn:</div>
      {items.map((item, i) => (
        <div key={i} className="flex justify-between">
          <span>{item.toolName.replace(/_/g, " ")}</span>
          <span>${item.amountUsdc.toFixed(3)}</span>
        </div>
      ))}
      <div className="border-t border-border pt-1 flex justify-between font-medium">
        <span>Charged</span>
        <span>${total.toFixed(3)}</span>
      </div>
    </div>
  );
}
