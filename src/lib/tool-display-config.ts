export interface ToolDisplayInfo {
  label: string;
  icon: string; // Lucide icon name
}

export const TOOL_DISPLAY: Record<string, ToolDisplayInfo> = {
  // Cluster tools
  analyze_defi_safety: { label: "DeFi Safety Analysis", icon: "Shield" },
  track_whale_activity: { label: "Whale Tracker", icon: "Fish" },
  analyze_social_narrative: { label: "Social Sentiment", icon: "MessageCircle" },
  analyze_market_trends: { label: "Market Intelligence", icon: "TrendingUp" },
  analyze_wallet_portfolio: { label: "Wallet Portfolio", icon: "Briefcase" },
  screen_token_alpha: { label: "Token Alpha", icon: "Target" },

  // MCP paid tools
  get_crypto_price: { label: "Crypto Price", icon: "DollarSign" },
  get_wallet_profile: { label: "Wallet Profile", icon: "Wallet" },
  summarize_url: { label: "URL Summary", icon: "Globe" },
  analyze_contract: { label: "Contract Analysis", icon: "FileCode" },
  generate_image: { label: "Image Generation", icon: "Image" },

  // Free tools
  add: { label: "Calculator", icon: "Calculator" },
  get_random_number: { label: "Random Number", icon: "Dice1" },
  check_budget: { label: "Budget Check", icon: "CreditCard" },
  search_x402_services: { label: "Service Search", icon: "Search" },
  probe_x402_service: { label: "Service Probe", icon: "Radar" },
  list_registered_services: { label: "Service List", icon: "List" },
};

export function getToolDisplay(toolName: string): ToolDisplayInfo {
  return TOOL_DISPLAY[toolName] ?? { label: toolName.replace(/_/g, " "), icon: "Wrench" };
}
