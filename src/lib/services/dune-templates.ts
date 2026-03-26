export interface DuneTemplate {
  id: string;
  duneQueryId: number;
  description: string;
  params: { name: string; type: "string" | "number"; required: boolean }[];
}

/**
 * Query template registry. duneQueryId values are placeholders (0) until
 * real queries are created and validated in the Dune UI.
 *
 * To add a new template:
 * 1. Write and test the SQL in Dune's query editor
 * 2. Save the query and copy its numeric ID
 * 3. Add an entry here with the real ID
 */
export const DUNE_TEMPLATES: Record<string, DuneTemplate> = {
  // ── Tier 1: Core ──────────────────────────────────────────────

  whale_net_flow_7d: {
    id: "whale_net_flow_7d",
    duneQueryId: 6909847,
    description: "Net large transfers (>$100k) for a token over 7 days — shows accumulation or distribution trend",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  cex_net_flow_7d: {
    id: "cex_net_flow_7d",
    duneQueryId: 6909858,
    description: "Net token flow into/out of centralized exchanges over 7 days — exchange outflow suggests accumulation",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  top_holder_changes_7d: {
    id: "top_holder_changes_7d",
    duneQueryId: 6909911,
    description: "Balance changes of top 50 token holders over 7 days",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  dex_volume_7d: {
    id: "dex_volume_7d",
    duneQueryId: 6909921,
    description: "Daily DEX trading volume for a token over 7 days — shows trading activity trend",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  wallet_pnl_30d: {
    id: "wallet_pnl_30d",
    duneQueryId: 6910133,
    description: "Realized and unrealized PnL for a wallet over 30 days",
    params: [
      { name: "wallet_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  // ── Tier 2: Differentiating ───────────────────────────────────

  liquidation_risk: {
    id: "liquidation_risk",
    duneQueryId: 6910139,
    description: "Top borrow positions near liquidation threshold for a token on lending protocols",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  bridge_flow_7d: {
    id: "bridge_flow_7d",
    duneQueryId: 6911550,
    description: "Net bridge inflows/outflows for a chain over 7 days — shows capital movement between L1s and L2s",
    params: [
      { name: "chain", type: "string", required: true },
    ],
  },

  stablecoin_supply_trend: {
    id: "stablecoin_supply_trend",
    duneQueryId: 6910160,
    description: "Stablecoin (USDC/USDT) supply trend on a chain over 30 days — growing supply = buying power signal",
    params: [
      { name: "chain", type: "string", required: true },
    ],
  },

  smart_money_moves_7d: {
    id: "smart_money_moves_7d",
    duneQueryId: 6910198,
    description: "Token transfers by labeled smart money wallets (funds, whales, institutions) over 7 days",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  dex_pair_depth: {
    id: "dex_pair_depth",
    duneQueryId: 6910213,
    description: "Trade size distribution and estimated slippage for a token — shows real liquidity depth",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  // ── Tier 3: Extended ──────────────────────────────────────────

  flash_loan_activity: {
    id: "flash_loan_activity",
    duneQueryId: 6910223,
    description: "Flash loan activity involving a token over 7 days — spikes may indicate exploit risk",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  contract_interaction_trend: {
    id: "contract_interaction_trend",
    duneQueryId: 6910241,
    description: "Daily unique callers and transaction count for a contract over 7 days — shows protocol usage trend",
    params: [
      { name: "contract_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  token_velocity: {
    id: "token_velocity",
    duneQueryId: 6910256,
    description: "Token transfer frequency and unique sender/receiver count over 7 days — high velocity = speculation, low = utility",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },

  mev_exposure: {
    id: "mev_exposure",
    duneQueryId: 6910274,
    description: "Sandwich attack frequency and estimated cost for a token's DEX trades over 7 days",
    params: [
      { name: "token_address", type: "string", required: true },
      { name: "chain", type: "string", required: true },
    ],
  },
};

/** Get a template by name. Returns undefined if not found. */
export function getTemplate(name: string): DuneTemplate | undefined {
  return DUNE_TEMPLATES[name];
}

/** All template names (for Zod enum in tool schema). */
export const TEMPLATE_NAMES = Object.keys(DUNE_TEMPLATES) as [string, ...string[]];

/** Check if a template has a real Dune query ID (not placeholder 0). */
export function isTemplateReady(template: DuneTemplate): boolean {
  return template.duneQueryId > 0;
}
