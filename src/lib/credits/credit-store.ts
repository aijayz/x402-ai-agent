import { sql } from "../db";

/** Convert USDC float to integer microdollars. */
export function MICRO_USDC(usdc: number): number {
  return Math.round(usdc * 1_000_000);
}

/** Convert integer microdollars to USDC float for display. */
export function toUsdc(micro: number): number {
  return micro / 1_000_000;
}

export interface CreditAccount {
  walletAddress: string;
  balanceMicroUsdc: number;
  lifetimeSpentMicroUsdc: number;
  freeCreditsGranted: boolean;
  freeCreditsAmountMicroUsdc: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DeductResult {
  success: boolean;
  newBalanceMicroUsdc?: number;
}

export const CreditStore = {
  async getOrCreate(walletAddress: string): Promise<CreditAccount> {
    const rows = await sql`
      INSERT INTO credit_accounts (wallet_address)
      VALUES (${walletAddress})
      ON CONFLICT (wallet_address)
        DO UPDATE SET wallet_address = credit_accounts.wallet_address
      RETURNING *
    `;
    return mapRow(rows[0]);
  },

  async get(walletAddress: string): Promise<CreditAccount | null> {
    const rows = await sql`
      SELECT * FROM credit_accounts WHERE wallet_address = ${walletAddress}
    `;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  async deduct(walletAddress: string, amountMicroUsdc: number): Promise<DeductResult> {
    const rows = await sql`
      UPDATE credit_accounts
      SET balance_micro_usdc = balance_micro_usdc - ${amountMicroUsdc},
          updated_at = now()
      WHERE wallet_address = ${walletAddress}
        AND balance_micro_usdc >= ${amountMicroUsdc}
      RETURNING balance_micro_usdc
    `;
    if (rows.length === 0) {
      return { success: false };
    }
    return { success: true, newBalanceMicroUsdc: Number(rows[0].balance_micro_usdc) };
  },

  async reserve(walletAddress: string, amountMicroUsdc: number): Promise<DeductResult> {
    return this.deduct(walletAddress, amountMicroUsdc);
  },

  async release(walletAddress: string, amountMicroUsdc: number): Promise<number> {
    return this.credit(walletAddress, amountMicroUsdc);
  },

  async credit(walletAddress: string, amountMicroUsdc: number): Promise<number> {
    const rows = await sql`
      UPDATE credit_accounts
      SET balance_micro_usdc = balance_micro_usdc + ${amountMicroUsdc},
          updated_at = now()
      WHERE wallet_address = ${walletAddress}
      RETURNING balance_micro_usdc
    `;
    return Number(rows[0].balance_micro_usdc);
  },

  async grantFreeCredits(walletAddress: string, amountMicroUsdc: number): Promise<number> {
    const rows = await sql`
      UPDATE credit_accounts
      SET balance_micro_usdc = balance_micro_usdc + ${amountMicroUsdc},
          free_credits_granted = true,
          free_credits_amount_micro_usdc = ${amountMicroUsdc},
          updated_at = now()
      WHERE wallet_address = ${walletAddress}
        AND free_credits_granted = false
      RETURNING balance_micro_usdc
    `;
    return rows.length > 0 ? Number(rows[0].balance_micro_usdc) : 0;
  },
};

function mapRow(row: Record<string, unknown>): CreditAccount {
  return {
    walletAddress: row.wallet_address as string,
    balanceMicroUsdc: Number(row.balance_micro_usdc),
    lifetimeSpentMicroUsdc: Number(row.lifetime_spent_micro_usdc),
    freeCreditsGranted: row.free_credits_granted as boolean,
    freeCreditsAmountMicroUsdc: Number(row.free_credits_amount_micro_usdc),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
