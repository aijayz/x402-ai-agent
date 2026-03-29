import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";

export interface TokenSnapshot {
  id: string;
  symbol: string;
  data: TokenSnapshotData;
  digestDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenSnapshotData {
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  iconUrl?: string;
  security?: { score: number; details?: string } | null;
  whaleFlow?: { netFlowUsd: number; largeTxCount: number; totalVolumeUsd?: number; hasExchangeSplit?: boolean } | null;
  sentiment?: { score: number | null; label: string | null; summary: string | null } | null;
  unlocks?: {
    category: string | null;
    sector: string | null;
    projectedEndDate: string | null;
  } | null;
  intelligence?: string[];
}

function mapRow(row: Record<string, unknown>): TokenSnapshot {
  const dd = row.digest_date;
  let digestDate: string;
  if (dd instanceof Date) {
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    const d = String(dd.getDate()).padStart(2, "0");
    digestDate = `${y}-${m}-${d}`;
  } else {
    digestDate = String(dd).slice(0, 10);
  }

  return {
    id: String(row.id),
    symbol: String(row.symbol),
    data: row.data as TokenSnapshotData,
    digestDate,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const sql = () => neon(env.DATABASE_URL);

export const TokenSnapshotStore = {
  /** Upsert a snapshot for a symbol+date (idempotent). */
  async upsert(symbol: string, date: string, data: TokenSnapshotData): Promise<TokenSnapshot> {
    const rows = await sql()`
      INSERT INTO token_snapshots (symbol, data, digest_date)
      VALUES (${symbol.toUpperCase()}, ${JSON.stringify(data)}, ${date})
      ON CONFLICT (symbol, digest_date) DO UPDATE
        SET data = EXCLUDED.data, updated_at = now()
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  /** Get the latest snapshot for a symbol. */
  async getBySymbol(symbol: string): Promise<TokenSnapshot | null> {
    const rows = await sql()`
      SELECT * FROM token_snapshots
      WHERE symbol = ${symbol.toUpperCase()}
      ORDER BY digest_date DESC
      LIMIT 1
    `;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  /** Get all distinct symbols that have snapshots. */
  async getAllSymbols(): Promise<string[]> {
    const rows = await sql()`
      SELECT DISTINCT symbol FROM token_snapshots ORDER BY symbol
    `;
    return rows.map((r) => String(r.symbol));
  },

  /** Get the most recent digest_date across all snapshots. */
  async getLatestSnapshotDate(): Promise<string | null> {
    const rows = await sql()`
      SELECT MAX(digest_date) as latest FROM token_snapshots
    `;
    if (!rows.length || !rows[0].latest) return null;
    const dd = rows[0].latest;
    if (dd instanceof Date) {
      const y = dd.getFullYear();
      const m = String(dd.getMonth() + 1).padStart(2, "0");
      const d = String(dd.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(dd).slice(0, 10);
  },
};
