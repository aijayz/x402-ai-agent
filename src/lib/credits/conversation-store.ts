import { sql } from "../db";

export interface Conversation {
  id: string;
  walletAddress: string;
  title: string;
  messages: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ConversationStore = {
  /** List conversations for a wallet, newest first. */
  async list(walletAddress: string, limit = 50): Promise<ConversationSummary[]> {
    const rows = await sql`
      SELECT id, title, created_at, updated_at
      FROM conversations
      WHERE wallet_address = ${walletAddress}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
    }));
  },

  /** Get a single conversation by ID (must belong to wallet). */
  async get(id: string, walletAddress: string): Promise<Conversation | null> {
    const rows = await sql`
      SELECT id, wallet_address, title, messages, created_at, updated_at
      FROM conversations
      WHERE id = ${id} AND wallet_address = ${walletAddress}
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id as string,
      walletAddress: r.wallet_address as string,
      title: r.title as string,
      messages: r.messages as unknown[],
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
    };
  },

  /** Create a new conversation. Returns the new ID. */
  async create(walletAddress: string, title: string, messages: unknown[]): Promise<string> {
    const rows = await sql`
      INSERT INTO conversations (wallet_address, title, messages)
      VALUES (${walletAddress}, ${title}, ${JSON.stringify(messages)})
      RETURNING id
    `;
    return rows[0].id as string;
  },

  /** Update messages and title for an existing conversation. */
  async update(id: string, walletAddress: string, data: { title?: string; messages?: unknown[] }): Promise<boolean> {
    if (data.title && data.messages) {
      const rows = await sql`
        UPDATE conversations
        SET title = ${data.title}, messages = ${JSON.stringify(data.messages)}, updated_at = now()
        WHERE id = ${id} AND wallet_address = ${walletAddress}
        RETURNING id
      `;
      return rows.length > 0;
    } else if (data.messages) {
      const rows = await sql`
        UPDATE conversations
        SET messages = ${JSON.stringify(data.messages)}, updated_at = now()
        WHERE id = ${id} AND wallet_address = ${walletAddress}
        RETURNING id
      `;
      return rows.length > 0;
    } else if (data.title) {
      const rows = await sql`
        UPDATE conversations
        SET title = ${data.title}, updated_at = now()
        WHERE id = ${id} AND wallet_address = ${walletAddress}
        RETURNING id
      `;
      return rows.length > 0;
    }
    return false;
  },

  /** Delete a conversation. */
  async delete(id: string, walletAddress: string): Promise<boolean> {
    const rows = await sql`
      DELETE FROM conversations
      WHERE id = ${id} AND wallet_address = ${walletAddress}
      RETURNING id
    `;
    return rows.length > 0;
  },
};
