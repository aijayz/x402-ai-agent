"use client";

interface ReceiptItem {
  toolName: string;
  amountUsdc: number;
}

interface SessionReceiptProps {
  items: ReceiptItem[];
}

export function SessionReceipt({ items }: SessionReceiptProps) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.amountUsdc, 0);

  return (
    <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs font-mono space-y-1">
      <div className="text-muted-foreground mb-1">Used this turn:</div>
      {items.map((item, i) => (
        <div key={i} className="flex justify-between">
          <span>{item.toolName.replace(/_/g, " ")}</span>
          <span>${item.amountUsdc.toFixed(3)}</span>
        </div>
      ))}
      <div className="border-t border-border pt-1 flex justify-between font-medium">
        <span>Total</span>
        <span>${total.toFixed(3)}</span>
      </div>
    </div>
  );
}
