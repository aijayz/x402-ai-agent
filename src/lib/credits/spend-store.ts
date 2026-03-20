import { sql } from "../db";

export interface SpendEvent {
  id: number;
  walletAddress: string;
  toolName: string;
  serviceCostMicroUsdc: number;
  chargedAmountMicroUsdc: number;
  markupBps: number;
  txHash: string | null;
  createdAt: Date;
}

export const SpendEventStore = {
  async record(event: {
    walletAddress: string;
    toolName: string;
    serviceCostMicroUsdc: number;
    chargedAmountMicroUsdc: number;
    markupBps: number;
    txHash?: string;
  }): Promise<void> {
    await sql`
      INSERT INTO spend_events (
        wallet_address, tool_name,
        service_cost_micro_usdc, charged_amount_micro_usdc,
        markup_bps, tx_hash
      ) VALUES (
        ${event.walletAddress}, ${event.toolName},
        ${event.serviceCostMicroUsdc}, ${event.chargedAmountMicroUsdc},
        ${event.markupBps}, ${event.txHash ?? null}
      )
    `;
  },

  async existsByTxHash(txHash: string): Promise<boolean> {
    const rows = await sql`
      SELECT 1 FROM spend_events WHERE tx_hash = ${txHash} LIMIT 1
    `;
    return rows.length > 0;
  },

  async getRecent(walletAddress: string, limit = 20): Promise<SpendEvent[]> {
    const rows = await sql`
      SELECT * FROM spend_events
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(mapRow);
  },
};

function mapRow(row: Record<string, unknown>): SpendEvent {
  return {
    id: Number(row.id),
    walletAddress: row.wallet_address as string,
    toolName: row.tool_name as string,
    serviceCostMicroUsdc: Number(row.service_cost_micro_usdc),
    chargedAmountMicroUsdc: Number(row.charged_amount_micro_usdc),
    markupBps: Number(row.markup_bps),
    txHash: row.tx_hash as string | null,
    createdAt: new Date(row.created_at as string),
  };
}
