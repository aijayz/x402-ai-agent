import { env } from "../env";
import type { X402ServiceAdapter } from "./types";

// Lazy imports to avoid circular dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdapterLoader = () => Promise<X402ServiceAdapter<any, any>>;

const adapters: Record<string, { real: AdapterLoader; stub: AdapterLoader }> = {
  "augur": {
    real: () => import("./adapters/augur").then(m => m.augurAdapter),
    stub: () => import("./adapters/stubs/augur.stub").then(m => m.augurStub),
  },
  // Messari endpoints (api.messari.io) — institutional crypto intelligence
  "messari-token-unlocks": {
    real: () => import("./adapters/messari").then(m => m.messariTokenUnlocksAdapter),
    stub: () => import("./adapters/stubs/messari.stub").then(m => m.messariTokenUnlocksStub),
  },
  // QuantumShield endpoints (quantumshield-api.vercel.app)
  "qs-token-security": {
    real: () => import("./adapters/quantum-shield").then(m => m.qsTokenSecurity),
    stub: () => import("./adapters/stubs/quantum-shield.stub").then(m => m.qsTokenSecurityStub),
  },
  "qs-contract-audit": {
    real: () => import("./adapters/quantum-shield").then(m => m.qsContractAudit),
    stub: () => import("./adapters/stubs/quantum-shield.stub").then(m => m.qsContractAuditStub),
  },
  "qs-wallet-risk": {
    real: () => import("./adapters/quantum-shield").then(m => m.qsWalletRisk),
    stub: () => import("./adapters/stubs/quantum-shield.stub").then(m => m.qsWalletRiskStub),
  },
};

export type ServiceName = keyof typeof adapters;

const cache = new Map<string, X402ServiceAdapter>();

export async function getService(name: ServiceName): Promise<X402ServiceAdapter> {
  const key = `${name}-${env.NETWORK}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const entry = adapters[name];
  const isMainnet = env.NETWORK === "base";
  const adapter = await (isMainnet ? entry.real() : entry.stub());
  cache.set(key, adapter);
  return adapter;
}
