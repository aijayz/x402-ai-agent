import { base, baseSepolia, mainnet, arbitrum, optimism } from "viem/chains";
import type { Chain } from "viem";

export type ChainKey = "base" | "ethereum" | "arbitrum" | "optimism";

export interface ChainConfig {
  name: string;
  key: ChainKey;
  network: string;               // CDP network name
  chainId: number;
  viemChain: Chain;
  usdcAddress: `0x${string}`;
  depositAddress: string;         // same CDP purchaser for all EVM
  explorerBaseUrl: string;
  rpcUrl: string;
}

// Purchaser wallet address (CDP-managed, same key on all EVM chains)
const DEPOSIT_ADDRESS = "0x58F34156c7fA8a37f877e0CfE0A3A2234e97751e";

export const SUPPORTED_CHAINS: Record<ChainKey, ChainConfig> = {
  base: {
    name: "Base",
    key: "base",
    network: "base",
    chainId: 8453,
    viemChain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
  },
  ethereum: {
    name: "Ethereum",
    key: "ethereum",
    network: "ethereum",
    chainId: 1,
    viemChain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://etherscan.io",
    rpcUrl: "https://eth.llamarpc.com",
  },
  arbitrum: {
    name: "Arbitrum",
    key: "arbitrum",
    network: "arbitrum",
    chainId: 42161,
    viemChain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://arbiscan.io",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    name: "Optimism",
    key: "optimism",
    network: "optimism",
    chainId: 10,
    viemChain: optimism,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://optimistic.etherscan.io",
    rpcUrl: "https://mainnet.optimism.io",
  },
};

// Testnet config (only Base Sepolia)
export const TESTNET_CHAINS: Record<string, ChainConfig> = {
  base: {
    name: "Base Sepolia",
    key: "base",
    network: "base-sepolia",
    chainId: 84532,
    viemChain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    depositAddress: DEPOSIT_ADDRESS,
    explorerBaseUrl: "https://sepolia.basescan.org",
    rpcUrl: "https://sepolia.base.org",
  },
};

/** Get chain configs for current network. Testnet = Base only. Mainnet = all 4. */
export function getChainConfigs(network: "base" | "base-sepolia"): Record<string, ChainConfig> {
  return network === "base" ? SUPPORTED_CHAINS : TESTNET_CHAINS;
}

/** Look up a chain config by key, with network awareness. */
export function getChainConfig(chainKey: string, network: "base" | "base-sepolia"): ChainConfig | undefined {
  return getChainConfigs(network)[chainKey];
}

/** All chain keys for current network. */
export function getChainKeys(network: "base" | "base-sepolia"): string[] {
  return Object.keys(getChainConfigs(network));
}
