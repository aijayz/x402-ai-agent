/**
 * Find and merge duplicate wallet addresses (case-insensitive duplicates).
 *
 * Usage:
 *   npx tsx scripts/merge-duplicate-wallets.ts              # Show duplicates only
 *   npx tsx scripts/merge-duplicate-wallets.ts --merge      # Merge duplicates
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

const doMerge = process.argv.includes("--merge");
const dryRun = !doMerge;

const databaseUrl = process.env.DATABASE_URL?.replace(/\\n$/, "");
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

interface DuplicateGroup {
  normalized: string;
  variants: { wallet_address: string; balance: number; lifetime_spent: number }[];
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  // Find wallet addresses that have multiple case variants
  const rows = await sql`
    SELECT
      LOWER(wallet_address) as normalized,
      wallet_address,
      balance_micro_usdc,
      lifetime_spent_micro_usdc
    FROM credit_accounts
    WHERE LOWER(wallet_address) IN (
      SELECT LOWER(wallet_address)
      FROM credit_accounts
      GROUP BY LOWER(wallet_address)
      HAVING COUNT(*) > 1
    )
    ORDER BY LOWER(wallet_address), wallet_address
  `;

  // Group by normalized address
  const groups: Map<string, DuplicateGroup> = new Map();
  for (const row of rows) {
    const normalized = row.normalized as string;
    if (!groups.has(normalized)) {
      groups.set(normalized, { normalized, variants: [] });
    }
    groups.get(normalized)!.variants.push({
      wallet_address: row.wallet_address as string,
      balance: Number(row.balance_micro_usdc),
      lifetime_spent: Number(row.lifetime_spent_micro_usdc),
    });
  }

  return Array.from(groups.values());
}

async function mergeDuplicates(duplicates: DuplicateGroup[]): Promise<void> {
  for (const group of duplicates) {
    // Pick the lowercase variant as the canonical one (or first if none is lowercase)
    const canonical =
      group.variants.find((v) => v.wallet_address === group.normalized) ||
      group.variants[0];

    // Sum balances from all variants
    const totalBalance = group.variants.reduce((sum, v) => sum + v.balance, 0);
    const totalSpent = group.variants.reduce((sum, v) => sum + v.lifetime_spent, 0);

    // Keep the canonical, merge others into it
    const others = group.variants.filter((v) => v.wallet_address !== canonical.wallet_address);

    if (dryRun) {
      console.log(`\n[DRY RUN] Would merge for ${group.normalized}:`);
      console.log(`  Canonical: ${canonical.wallet_address}`);
      for (const other of others) {
        console.log(`  Merge:     ${other.wallet_address} (balance: $${other.balance / 1_000_000})`);
      }
      console.log(`  Result: balance = $${totalBalance / 1_000_000}, lifetime_spent = $${totalSpent / 1_000_000}`);
    } else {
      console.log(`\nMerging ${group.normalized}...`);

      // Update canonical account with summed values
      await sql`
        UPDATE credit_accounts
        SET balance_micro_usdc = ${totalBalance},
            lifetime_spent_micro_usdc = ${totalSpent},
            wallet_address = ${group.normalized}
        WHERE wallet_address = ${canonical.wallet_address}
      `;

      // Re-parent spend_events to canonical
      for (const other of others) {
        await sql`
          UPDATE spend_events
          SET wallet_address = ${group.normalized}
          WHERE wallet_address = ${other.wallet_address}
        `;
      }

      // Re-parent conversations to canonical
      for (const other of others) {
        await sql`
          UPDATE conversations
          SET wallet_address = ${group.normalized}
          WHERE wallet_address = ${other.wallet_address}
        `;
      }

      // Re-parent reports to canonical
      for (const other of others) {
        await sql`
          UPDATE reports
          SET wallet_address = ${group.normalized}
          WHERE wallet_address = ${other.wallet_address}
        `;
      }

      // Delete non-canonical accounts
      for (const other of others) {
        await sql`
          DELETE FROM credit_accounts WHERE wallet_address = ${other.wallet_address}
        `;
      }

      console.log(`  OK: merged ${others.length} variant(s)`);
    }
  }
}

async function main() {
  console.log(`Database: ${databaseUrl!.replace(/:[^@]+@/, ":***@")}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (show duplicates only)" : "LIVE (merge duplicates)"}\n`);

  const duplicates = await findDuplicates();

  if (duplicates.length === 0) {
    console.log("No duplicate wallet addresses found. Safe to run normalize migration.");
    return;
  }

  console.log(`Found ${duplicates.length} duplicate address groups:\n`);
  for (const group of duplicates) {
    console.log(`  ${group.normalized}:`);
    for (const v of group.variants) {
      console.log(`    ${v.wallet_address} — balance: $${v.balance / 1_000_000}, spent: $${v.lifetime_spent / 1_000_000}`);
    }
  }

  if (!dryRun) {
    console.log("\nProceeding with merge...");
    await mergeDuplicates(duplicates);
    console.log("\nMerge complete. Run migration again to normalize remaining addresses.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});