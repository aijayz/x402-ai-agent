import { sql } from "@/lib/db";

export interface Report {
  id: string;
  walletAddress: string | null;
  title: string;
  content: string;
  markers: unknown[] | null;
  metadata: Record<string, unknown> | null;
  type: "user" | "digest";
  digestDate: string | null;
  createdAt: string;
  expiresAt: string | null;
}

function mapRow(row: Record<string, unknown>): Report {
  return {
    id: row.id as string,
    walletAddress: row.wallet_address as string | null,
    title: row.title as string,
    content: row.content as string,
    markers: row.markers as unknown[] | null,
    metadata: row.metadata as Record<string, unknown> | null,
    type: (row.type as string) as "user" | "digest",
    digestDate: row.digest_date ? String(row.digest_date) : null,
    createdAt: String(row.created_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

function generateId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

export const ReportStore = {
  async create(params: {
    walletAddress?: string | null;
    title: string;
    content: string;
    markers?: unknown[];
    metadata?: Record<string, unknown>;
    type?: "user" | "digest";
    digestDate?: string;
  }): Promise<Report> {
    const id = generateId();
    const expiresAt =
      params.type === "digest"
        ? null
        : new Date(Date.now() + 90 * 86_400_000).toISOString();

    const rows = await sql`
      INSERT INTO reports (id, wallet_address, title, content, markers, metadata, type, digest_date, expires_at)
      VALUES (
        ${id},
        ${params.walletAddress ?? null},
        ${params.title},
        ${params.content},
        ${params.markers ? JSON.stringify(params.markers) : null}::jsonb,
        ${params.metadata ? JSON.stringify(params.metadata) : null}::jsonb,
        ${params.type ?? "user"},
        ${params.digestDate ?? null},
        ${expiresAt}
      )
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  async getById(id: string): Promise<Report | null> {
    const rows = await sql`SELECT * FROM reports WHERE id = ${id}`;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  async getLatestDigest(): Promise<Report | null> {
    const rows = await sql`
      SELECT * FROM reports WHERE type = 'digest' ORDER BY created_at DESC LIMIT 1
    `;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  async deleteById(id: string, walletAddress: string): Promise<boolean> {
    const rows = await sql`
      DELETE FROM reports WHERE id = ${id} AND wallet_address = ${walletAddress} RETURNING id
    `;
    return rows.length > 0;
  },

  async cleanExpired(): Promise<number> {
    const rows = await sql`
      DELETE FROM reports WHERE expires_at IS NOT NULL AND expires_at < now() RETURNING id
    `;
    return rows.length;
  },
};
