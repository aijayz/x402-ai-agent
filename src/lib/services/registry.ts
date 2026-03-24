import { env } from "../env";
import type { X402ServiceAdapter } from "./types";

// Lazy imports to avoid circular dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdapterLoader = () => Promise<X402ServiceAdapter<any, any>>;

const adapters: Record<string, { real: AdapterLoader; stub: AdapterLoader }> = {
  "genvox": {
    real: () => import("./adapters/genvox").then(m => m.genvoxAdapter),
    stub: () => import("./adapters/stubs/genvox.stub").then(m => m.genVoxStub),
  },
  "augur": {
    real: () => import("./adapters/augur").then(m => m.augurAdapter),
    stub: () => import("./adapters/stubs/augur.stub").then(m => m.augurStub),
  },
  // Messari endpoints (api.messari.io) — institutional crypto intelligence
  "messari-token-unlocks": {
    real: () => import("./adapters/messari").then(m => m.messariTokenUnlocksAdapter),
    stub: () => import("./adapters/stubs/messari.stub").then(m => m.messariTokenUnlocksStub),
  },
  // SLAMai endpoints (api.slamai.dev) — smart money intelligence, $0.001/call
  "slamai-wallet": {
    real: () => import("./adapters/slamai").then(m => m.slaMaiWalletAdapter),
    stub: () => import("./adapters/stubs/slamai.stub").then(m => m.slaMaiWalletStub),
  },
  "slamai-token-holders": {
    real: () => import("./adapters/slamai").then(m => m.slaMaiTokenHoldersAdapter),
    stub: () => import("./adapters/stubs/slamai.stub").then(m => m.slaMaiTokenHoldersStub),
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
  "qs-whale-activity": {
    real: () => import("./adapters/quantum-shield").then(m => m.qsWhaleActivity),
    stub: () => import("./adapters/stubs/quantum-shield.stub").then(m => m.qsWhaleActivityStub),
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
