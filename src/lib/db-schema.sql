-- src/lib/db-schema.sql
-- Run this against your Neon database to create all tables.
-- All monetary values are stored as integer microdollars (1 USDC = 1,000,000).

CREATE TABLE IF NOT EXISTS credit_accounts (
  wallet_address TEXT PRIMARY KEY,
  balance_micro_usdc BIGINT NOT NULL DEFAULT 0,
  lifetime_spent_micro_usdc BIGINT NOT NULL DEFAULT 0,
  free_credits_granted BOOLEAN NOT NULL DEFAULT false,
  free_credits_amount_micro_usdc BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  session_id TEXT PRIMARY KEY,
  free_calls_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_created
  ON anonymous_sessions (created_at);

CREATE TABLE IF NOT EXISTS spend_events (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES credit_accounts(wallet_address),
  tool_name TEXT NOT NULL,
  service_cost_micro_usdc BIGINT NOT NULL,
  charged_amount_micro_usdc BIGINT NOT NULL,
  markup_bps INTEGER NOT NULL,
  tx_hash TEXT,
  source_chain TEXT NOT NULL DEFAULT 'base',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT spend_events_tx_chain_unique UNIQUE (tx_hash, source_chain)
);

CREATE INDEX IF NOT EXISTS idx_spend_events_wallet
  ON spend_events (wallet_address, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wallet_address TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_wallet
  ON conversations (wallet_address, updated_at DESC);
