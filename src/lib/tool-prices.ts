/**
 * Canonical tool prices in USDC. Single source of truth used by both
 * the MCP server (to set 402 payment amounts) and the chat API
 * (to deduct credits after on-chain payment).
 */
export const TOOL_PRICES: Record<string, number> = {
  get_crypto_price: 0.01,
  get_wallet_profile: 0.02,
  summarize_url: 0.03,
  analyze_contract: 0.03,
  generate_image: 0.05,
  query_onchain_data: 0.05,
  // Cluster tools — canonical user-facing prices (pre-markup)
  analyze_defi_safety: 0.05,
  track_whale_activity: 0.02,
  analyze_wallet_portfolio: 0.02,
  analyze_social_narrative: 0.17,
  screen_token_alpha: 0.33,
  analyze_market_trends: 0.04,
};
