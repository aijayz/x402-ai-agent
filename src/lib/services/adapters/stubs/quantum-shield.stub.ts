import type { X402ServiceAdapter, X402ServiceResponse } from "../../types";

function hashToIndex(s: string, poolSize: number): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

interface QSInput { address: string }

// --- Token Security ---
const TOKEN_SECURITY_POOL = [
  { riskScore: 12, honeypot: false, taxRate: 0.02, mintable: false, proxy: false },
  { riskScore: 58, honeypot: false, taxRate: 0.15, mintable: true, proxy: false },
  { riskScore: 89, honeypot: true, taxRate: 0.99, mintable: true, proxy: true },
];

export const qsTokenSecurityStub: X402ServiceAdapter<QSInput, unknown> = {
  name: "QS Token Security",
  estimatedCostMicroUsdc: 2_000,
  async call(input: QSInput): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, TOKEN_SECURITY_POOL.length);
    return { data: TOKEN_SECURITY_POOL[idx], cost: 2_000, source: "QuantumShield Token Security (stub)" };
  },
};

// --- Contract Audit ---
const CONTRACT_AUDIT_POOL = [
  { securityScore: 92, issues: [], compiler: "0.8.20", optimization: true },
  { securityScore: 61, issues: ["reentrancy-risk", "unchecked-transfer"], compiler: "0.8.17", optimization: false },
  { securityScore: 34, issues: ["selfdestruct", "delegatecall-proxy", "hidden-mint"], compiler: "0.6.12", optimization: false },
];

export const qsContractAuditStub: X402ServiceAdapter<QSInput, unknown> = {
  name: "QS Contract Audit",
  estimatedCostMicroUsdc: 3_000,
  async call(input: QSInput): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, CONTRACT_AUDIT_POOL.length);
    return { data: CONTRACT_AUDIT_POOL[idx], cost: 3_000, source: "QuantumShield Contract Audit (stub)" };
  },
};

// --- Wallet Risk ---
const WALLET_RISK_POOL = [
  { riskScore: 8, labels: ["active-trader"], txCount: 1240, age: "2y" },
  { riskScore: 45, labels: ["mev-bot", "high-frequency"], txCount: 58000, age: "6mo" },
  { riskScore: 78, labels: ["tornado-linked", "new-wallet"], txCount: 12, age: "3d" },
];

export const qsWalletRiskStub: X402ServiceAdapter<QSInput, unknown> = {
  name: "QS Wallet Risk",
  estimatedCostMicroUsdc: 2_000,
  async call(input: QSInput): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, WALLET_RISK_POOL.length);
    return { data: WALLET_RISK_POOL[idx], cost: 2_000, source: "QuantumShield Wallet Risk (stub)" };
  },
};

// --- Whale Activity ---
const WHALE_ACTIVITY_POOL = [
  { whaleCount: 42, netFlow: "accumulating", topBuyer: "0xWhale1", volume24h: "$12.4M", trend: "bullish" },
  { whaleCount: 8, netFlow: "distributing", topSeller: "0xWhale2", volume24h: "$890K", trend: "bearish" },
  { whaleCount: 23, netFlow: "neutral", volume24h: "$3.1M", trend: "sideways" },
];

export const qsWhaleActivityStub: X402ServiceAdapter<QSInput, unknown> = {
  name: "QS Whale Activity",
  estimatedCostMicroUsdc: 2_000,
  async call(input: QSInput): Promise<X402ServiceResponse<unknown>> {
    const idx = hashToIndex(input.address, WHALE_ACTIVITY_POOL.length);
    return { data: WHALE_ACTIVITY_POOL[idx], cost: 2_000, source: "QuantumShield Whale Activity (stub)" };
  },
};

