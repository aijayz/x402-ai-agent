/**
 * Database migration script.
 * Reads DATABASE_URL from environment (or .env.production.local / .env.local).
 * Runs all migrations idempotently (safe to re-run).
 *
 * Usage:
 *   npx tsx scripts/migrate.ts                         # uses DATABASE_URL from env
 *   npx tsx scripts/migrate.ts --dry-run               # print SQL without executing
 *   DATABASE_URL=postgresql://... npx tsx scripts/migrate.ts
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load DATABASE_URL from env files if not already set
function loadEnvFile(filename: string) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^(DATABASE_URL)="?([^"]*)"?$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {}
}

loadEnvFile(".env.production.local");
loadEnvFile(".env.local");

const dryRun = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL?.replace(/\\n$/, "");
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL not set. Pull it with: vercel env pull .env.production.local --environment production");
  process.exit(1);
}

const sql = neon(databaseUrl);

// Each migration is [name, sql_statement].
// All must be idempotent (IF NOT EXISTS / IF EXISTS).
const migrations: [string, string][] = [
  [
    "add source_chain to spend_events",
    `ALTER TABLE spend_events ADD COLUMN IF NOT EXISTS source_chain TEXT NOT NULL DEFAULT 'base'`,
  ],
  [
    "add spend_events_tx_chain_unique constraint",
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'spend_events_tx_chain_unique'
       ) THEN
         ALTER TABLE spend_events ADD CONSTRAINT spend_events_tx_chain_unique UNIQUE (tx_hash, source_chain);
       END IF;
     END $$`,
  ],
  [
    "drop old spend_events_tx_hash_key unique if exists",
    `ALTER TABLE spend_events DROP CONSTRAINT IF EXISTS spend_events_tx_hash_key`,
  ],
  [
    "create reports table",
    `CREATE TABLE IF NOT EXISTS reports (
       id TEXT PRIMARY KEY,
       wallet_address TEXT,
       title TEXT NOT NULL,
       content TEXT NOT NULL,
       markers JSONB,
       metadata JSONB,
       type TEXT NOT NULL DEFAULT 'user',
       digest_date DATE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       expires_at TIMESTAMPTZ
     )`,
  ],
  [
    "create reports indexes",
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reports_wallet') THEN
         CREATE INDEX idx_reports_wallet ON reports(wallet_address);
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reports_created') THEN
         CREATE INDEX idx_reports_created ON reports(created_at DESC);
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reports_digest_date') THEN
         CREATE UNIQUE INDEX idx_reports_digest_date ON reports(digest_date) WHERE type = 'digest';
       END IF;
     END $$`,
  ],
  [
    "create token_snapshots table",
    `CREATE TABLE IF NOT EXISTS token_snapshots (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       symbol VARCHAR(20) NOT NULL,
       data JSONB NOT NULL,
       digest_date DATE NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  ],
  [
    "create token_snapshots indexes",
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_token_snapshots_symbol') THEN
         CREATE INDEX idx_token_snapshots_symbol ON token_snapshots (symbol);
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_token_snapshots_date') THEN
         CREATE INDEX idx_token_snapshots_date ON token_snapshots (digest_date);
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_token_snapshots_symbol_date') THEN
         CREATE UNIQUE INDEX idx_token_snapshots_symbol_date ON token_snapshots (symbol, digest_date);
       END IF;
     END $$`,
  ],
  [
    "normalize wallet addresses in credit_accounts",
    `UPDATE credit_accounts SET wallet_address = LOWER(wallet_address) WHERE wallet_address != LOWER(wallet_address)`,
  ],
  [
    "normalize wallet addresses in spend_events",
    `UPDATE spend_events SET wallet_address = LOWER(wallet_address) WHERE wallet_address != LOWER(wallet_address)`,
  ],
  [
    "normalize wallet addresses in conversations",
    `UPDATE conversations SET wallet_address = LOWER(wallet_address) WHERE wallet_address != LOWER(wallet_address)`,
  ],
  [
    "normalize wallet addresses in reports",
    `UPDATE reports SET wallet_address = LOWER(wallet_address) WHERE wallet_address IS NOT NULL AND wallet_address != LOWER(wallet_address)`,
  ],
];

async function main() {
  console.log(`Database: ${databaseUrl!.replace(/:[^@]+@/, ":***@")}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  for (const [name, statement] of migrations) {
    console.log(`-- ${name}`);
    if (dryRun) {
      console.log(`${statement.trim()};\n`);
    } else {
      try {
        await sql.query(statement);
        console.log(`   OK\n`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`   FAILED: ${msg}\n`);
        process.exit(1);
      }
    }
  }

  console.log(dryRun ? "Dry run complete." : "All migrations applied.");
}

main();
