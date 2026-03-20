import { sql } from "../db";

const MAX_FREE_CALLS = 2;

export interface AnonymousSession {
  sessionId: string;
  freeCallsUsed: number;
  createdAt: Date;
}

export const SessionStore = {
  async getOrCreate(sessionId: string): Promise<AnonymousSession> {
    const rows = await sql`
      INSERT INTO anonymous_sessions (session_id)
      VALUES (${sessionId})
      ON CONFLICT (session_id)
        DO UPDATE SET session_id = anonymous_sessions.session_id
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  async incrementCallCount(sessionId: string): Promise<number> {
    const rows = await sql`
      UPDATE anonymous_sessions
      SET free_calls_used = free_calls_used + 1
      WHERE session_id = ${sessionId}
      RETURNING free_calls_used
    `;
    return Number(rows[0].free_calls_used);
  },

  isFreeCallsExhausted(callCount: number): boolean {
    return callCount >= MAX_FREE_CALLS;
  },

  MAX_FREE_CALLS,
};

function mapRow(row: Record<string, unknown>): AnonymousSession {
  return {
    sessionId: row.session_id as string,
    freeCallsUsed: Number(row.free_calls_used),
    createdAt: new Date(row.created_at as string),
  };
}
