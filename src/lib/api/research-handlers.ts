/** Research handlers for public API — call x402 services directly without credit logic.
 *  Each handler mirrors a cluster's service orchestration but skips reserve/release. */

import { getService } from "@/lib/services";
import { telemetry } from "@/lib/telemetry";
import { env } from "@/lib/env";
import { resolveTargetForMessari } from "@/lib/services/coingecko";
import { safelyTruncateServiceCalls, toQSChain, toSLAMaiChain, augurSupportsChain } from "@/lib/clusters/types";
import type { ClusterResult, ServiceCallResult, ClusterChain } from "@/lib/clusters/types";
import type { PaymentContext } from "@/lib/services/types";
import type { WalletClient } from "viem";
import { queryDune } from "@/lib/services/dune";
import { getTemplate, isTemplateReady } from "@/lib/services/dune-templates";

/** Shared payment context for API calls — uses house wallet for x402 upstream payments. */
async function getPaymentContext(): Promise<PaymentContext> {
  const { getOrCreatePurchaserAccount } = await import("@/lib/accounts");
  const walletClient = await getOrCreatePurchaserAccount() as unknown as WalletClient;
  return { walletClient, userWallet: null };
}

// ── Cluster A: DeFi Safety ───────────────────────────────────────────

export async function executeDefiSafety(params: {
  target: string;
  depth: "quick" | "full";
  chain: string;
}): Promise<ClusterResult> {
  const { target, depth, chain } = params;
  const ctx = await getPaymentContext();
  const calls: ServiceCallResult[] = [];
  const errors: string[] = [];
  const messariTarget = await resolveTargetForMessari(target, env.NETWORK);
  const clusterStart = Date.now();

  const qsChain = toQSChain(chain as ClusterChain);
  const baseServices = [
    ...(augurSupportsChain(chain as ClusterChain)
      ? [{ name: "augur" as const, input: { address: target } }]
      : []),
    { name: "qs-token-security" as const, input: { address: target, chain: qsChain } },
    { name: "messari-token-unlocks" as const, input: { target: messariTarget } },
  ];
  const serviceConfigs = depth === "full"
    ? [...baseServices.slice(0, -1),
       { name: "qs-contract-audit" as const, input: { address: target, chain: qsChain } },
       ...baseServices.slice(-1)]
    : baseServices;

  const duneTemplates = ["liquidation_risk", "dex_pair_depth"] as const;
  const dunePromises = duneTemplates.map((tpl) => {
    const template = getTemplate(tpl);
    if (!template || !isTemplateReady(template)) return Promise.resolve(null);
    return queryDune(tpl, template.duneQueryId, { token_address: target, chain }).catch(() => null);
  });
  const duneResultsPromise = Promise.all(dunePromises);

  for (const svc of serviceConfigs) {
    const svcStart = Date.now();
    try {
      const adapter = await getService(svc.name);
      const result = await adapter.call(svc.input, ctx);
      calls.push({ serviceName: adapter.name, data: result.data, costMicroUsdc: result.cost, paid: result.cost > 0 });
      telemetry.serviceCall({ cluster: "A", service: svc.name, latencyMs: Date.now() - svcStart, success: true, costMicroUsdc: result.cost });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unavailable";
      telemetry.serviceCall({ cluster: "A", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
      errors.push(`${svc.name}: ${msg}`);
    }
  }

  const duneResults = await duneResultsPromise;
  const duneData: Record<string, unknown> = {};
  for (let i = 0; i < duneTemplates.length; i++) {
    if (duneResults[i]?.rows?.length) duneData[duneTemplates[i]] = duneResults[i]!.rows;
  }
  if (Object.keys(duneData).length > 0) {
    calls.push({ serviceName: "Dune Analytics (temporal)", data: duneData, costMicroUsdc: 0, paid: false });
  }

  const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
  telemetry.clusterComplete({ cluster: "A", tool: "analyze_defi_safety", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

  const successNames = calls.map(c => c.serviceName);
  const failedNames = errors.map(e => e.split(":")[0]);
  const summary = successNames.length > 0
    ? `Analyzed ${target} for DeFi safety risks.` + (failedNames.length > 0 ? ` Some services temporarily unavailable.` : "")
    : `DeFi Safety Analysis unavailable — all services failed.`;

  return { summary, serviceCalls: safelyTruncateServiceCalls(calls), totalCostMicroUsdc: totalCost };
}

// ── Cluster B: Whale Activity ────────────────────────────────────────

export async function executeWhaleActivity(params: {
  address: string;
  chain: string;
}): Promise<ClusterResult> {
  const { address, chain } = params;
  const ctx = await getPaymentContext();
  const calls: ServiceCallResult[] = [];
  const errors: string[] = [];
  const clusterStart = Date.now();

  const qsChain = toQSChain(chain as ClusterChain);
  const serviceConfigs = [
    { name: "qs-wallet-risk" as const, input: { address, chain: qsChain } },
    { name: "qs-whale-activity" as const, input: { address, chain: qsChain } },
    { name: "slamai-wallet" as const, input: { address, blockchain: toSLAMaiChain(chain as ClusterChain) } },
  ];

  const duneTemplates = ["whale_flow_ethereum", "smart_money_moves_7d"] as const;
  const dunePromises = duneTemplates.map((tpl) => {
    const template = getTemplate(tpl);
    if (!template || !isTemplateReady(template)) return Promise.resolve(null);
    const dParams = tpl === "whale_flow_ethereum" ? { token_addresses: address } : { token_address: address, chain };
    return queryDune(tpl, template.duneQueryId, dParams).catch(() => null);
  });
  const duneResultsPromise = Promise.all(dunePromises);

  for (const svc of serviceConfigs) {
    const svcStart = Date.now();
    try {
      const adapter = await getService(svc.name);
      const result = await adapter.call(svc.input, ctx);
      calls.push({ serviceName: adapter.name, data: result.data, costMicroUsdc: result.cost, paid: result.cost > 0 });
      telemetry.serviceCall({ cluster: "B", service: svc.name, latencyMs: Date.now() - svcStart, success: true, costMicroUsdc: result.cost });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unavailable";
      telemetry.serviceCall({ cluster: "B", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
      errors.push(`${svc.name}: ${msg}`);
    }
  }

  const duneResults = await duneResultsPromise;
  const duneData: Record<string, unknown> = {};
  for (let i = 0; i < duneTemplates.length; i++) {
    if (duneResults[i]?.rows?.length) duneData[duneTemplates[i]] = duneResults[i]!.rows;
  }
  if (Object.keys(duneData).length > 0) {
    calls.push({ serviceName: "Dune Analytics (temporal)", data: duneData, costMicroUsdc: 0, paid: false });
  }

  const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
  telemetry.clusterComplete({ cluster: "B", tool: "track_whale_activity", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

  const successNames = calls.map(c => c.serviceName);
  const failedNames = errors.map(e => e.split(":")[0]);
  const summary = successNames.length > 0
    ? `Tracked whale activity for ${address}.` + (failedNames.length > 0 ? ` Some services temporarily unavailable.` : "")
    : `Whale activity analysis unavailable — all services failed.`;

  return { summary, serviceCalls: safelyTruncateServiceCalls(calls), totalCostMicroUsdc: totalCost };
}

// ── Cluster C: Wallet Portfolio ──────────────────────────────────────

export async function executeWalletPortfolio(params: {
  address: string;
  chain: string;
}): Promise<ClusterResult> {
  const { address, chain } = params;
  const ctx = await getPaymentContext();
  const calls: ServiceCallResult[] = [];
  const errors: string[] = [];
  const clusterStart = Date.now();

  const qsChain = toQSChain(chain as ClusterChain);
  const serviceConfigs = [
    { name: "qs-wallet-risk" as const, input: { address, chain: qsChain } },
    { name: "slamai-wallet" as const, input: { address, blockchain: toSLAMaiChain(chain as ClusterChain) } },
    { name: "qs-whale-activity" as const, input: { address, chain: qsChain } },
  ];

  const walletPnlTemplate = getTemplate("wallet_pnl_30d");
  const dunePromise = (walletPnlTemplate && isTemplateReady(walletPnlTemplate))
    ? queryDune("wallet_pnl_30d", walletPnlTemplate.duneQueryId, { wallet_address: address, chain }).catch(() => null)
    : Promise.resolve(null);

  for (const svc of serviceConfigs) {
    const svcStart = Date.now();
    try {
      const adapter = await getService(svc.name);
      const result = await adapter.call(svc.input, ctx);
      calls.push({ serviceName: adapter.name, data: result.data, costMicroUsdc: result.cost, paid: result.cost > 0 });
      telemetry.serviceCall({ cluster: "C", service: svc.name, latencyMs: Date.now() - svcStart, success: true, costMicroUsdc: result.cost });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unavailable";
      telemetry.serviceCall({ cluster: "C", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
      errors.push(`${svc.name}: ${msg}`);
    }
  }

  const duneResult = await dunePromise;
  if (duneResult?.rows?.length) {
    calls.push({ serviceName: "Dune Analytics (30d PnL)", data: { wallet_pnl_30d: duneResult.rows }, costMicroUsdc: 0, paid: false });
  }

  const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
  telemetry.clusterComplete({ cluster: "C", tool: "analyze_wallet_portfolio", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

  const successNames = calls.map(c => c.serviceName);
  const failedNames = errors.map(e => e.split(":")[0]);
  const summary = successNames.length > 0
    ? `Analyzed wallet ${address}.` + (failedNames.length > 0 ? ` Some services temporarily unavailable.` : "")
    : `Wallet portfolio analysis unavailable — all services failed.`;

  return { summary, serviceCalls: safelyTruncateServiceCalls(calls), totalCostMicroUsdc: totalCost };
}

// ── Cluster D: Social Narrative ──────────────────────────────────────

export async function executeSocialNarrative(params: {
  topic: string;
  chain: string;
}): Promise<ClusterResult> {
  const { topic, chain } = params;
  const ctx = await getPaymentContext();
  const calls: ServiceCallResult[] = [];
  const errors: string[] = [];
  const clusterStart = Date.now();

  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(topic);
  const qsChain = toQSChain(chain as ClusterChain);
  const serviceConfigs: { name: "genvox" | "augur" | "qs-wallet-risk"; input: Record<string, string> }[] = [
    { name: "genvox", input: { topic } },
  ];
  if (isAddress) {
    if (augurSupportsChain(chain as ClusterChain)) {
      serviceConfigs.push({ name: "augur", input: { address: topic } });
    }
    serviceConfigs.push({ name: "qs-wallet-risk", input: { address: topic, chain: qsChain } });
  }

  for (const svc of serviceConfigs) {
    const svcStart = Date.now();
    try {
      const adapter = await getService(svc.name);
      const result = await adapter.call(svc.input, ctx);
      calls.push({ serviceName: adapter.name, data: result.data, costMicroUsdc: result.cost, paid: result.cost > 0 });
      telemetry.serviceCall({ cluster: "D", service: svc.name, latencyMs: Date.now() - svcStart, success: true, costMicroUsdc: result.cost });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unavailable";
      telemetry.serviceCall({ cluster: "D", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
      errors.push(`${svc.name}: ${msg}`);
    }
  }

  const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
  telemetry.clusterComplete({ cluster: "D", tool: "analyze_social_narrative", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

  const successNames = calls.map(c => c.serviceName);
  const failedNames = errors.map(e => e.split(":")[0]);
  const summary = successNames.length > 0
    ? `Analyzed social narrative for "${topic}".` + (failedNames.length > 0 ? ` Some services temporarily unavailable.` : "")
    : `Social narrative analysis unavailable — all services failed.`;

  return { summary, serviceCalls: safelyTruncateServiceCalls(calls), totalCostMicroUsdc: totalCost };
}

// ── Cluster E: Token Alpha ───────────────────────────────────────────

export async function executeTokenAlpha(params: {
  target: string;
  chain: string;
}): Promise<ClusterResult> {
  const { target, chain } = params;
  const ctx = await getPaymentContext();
  const calls: ServiceCallResult[] = [];
  const errors: string[] = [];
  const messariTarget = await resolveTargetForMessari(target, env.NETWORK);
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(target);
  const clusterStart = Date.now();

  const qsChain = toQSChain(chain as ClusterChain);
  const serviceConfigs = [
    ...(isAddress ? [{ name: "qs-token-security" as const, input: { address: target, chain: qsChain } }] : []),
    { name: "messari-token-unlocks" as const, input: { target: messariTarget } },
    { name: "messari-allocations" as const, input: { assetSymbol: messariTarget } },
  ];

  const duneTemplates = ["smart_money_moves_7d", "token_velocity"] as const;
  const dunePromises = isAddress
    ? duneTemplates.map((tpl) => {
        const template = getTemplate(tpl);
        if (!template || !isTemplateReady(template)) return Promise.resolve(null);
        return queryDune(tpl, template.duneQueryId, { token_address: target, chain }).catch(() => null);
      })
    : [];
  const duneResultsPromise = Promise.all(dunePromises);

  for (const svc of serviceConfigs) {
    const svcStart = Date.now();
    try {
      const adapter = await getService(svc.name);
      const result = await adapter.call(svc.input, ctx);
      calls.push({ serviceName: adapter.name, data: result.data, costMicroUsdc: result.cost, paid: result.cost > 0 });
      telemetry.serviceCall({ cluster: "E", service: svc.name, latencyMs: Date.now() - svcStart, success: true, costMicroUsdc: result.cost });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unavailable";
      telemetry.serviceCall({ cluster: "E", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
      errors.push(`${svc.name}: ${msg}`);
    }
  }

  const duneResults = await duneResultsPromise;
  const duneData: Record<string, unknown> = {};
  for (let i = 0; i < duneTemplates.length; i++) {
    if (duneResults[i]?.rows?.length) duneData[duneTemplates[i]] = duneResults[i]!.rows;
  }
  if (Object.keys(duneData).length > 0) {
    calls.push({ serviceName: "Dune Analytics (temporal)", data: duneData, costMicroUsdc: 0, paid: false });
  }

  const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
  telemetry.clusterComplete({ cluster: "E", tool: "screen_token_alpha", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

  const successNames = calls.map(c => c.serviceName);
  const failedNames = errors.map(e => e.split(":")[0]);
  const summary = successNames.length > 0
    ? `Screened ${target} for alpha signals.` + (failedNames.length > 0 ? ` Some services temporarily unavailable.` : "")
    : `Token alpha screening unavailable — all services failed.`;

  return { summary, serviceCalls: safelyTruncateServiceCalls(calls), totalCostMicroUsdc: totalCost };
}

// ── Cluster F: Market Trends ─────────────────────────────────────────

export async function executeMarketTrends(params: {
  query: string;
  contractAddress?: string;
  chain: string;
}): Promise<ClusterResult> {
  const { query, contractAddress, chain } = params;
  const ctx = await getPaymentContext();
  const calls: ServiceCallResult[] = [];
  const errors: string[] = [];
  const clusterStart = Date.now();

  const qsChain = toQSChain(chain as ClusterChain);
  const serviceConfigs: { name: "genvox" | "qs-contract-audit"; input: Record<string, string> }[] = [
    { name: "genvox", input: { topic: query } },
  ];
  if (contractAddress) {
    serviceConfigs.push({ name: "qs-contract-audit", input: { address: contractAddress, chain: qsChain } });
  }

  const dunePromises: Promise<unknown>[] = [];
  const duneLabels: string[] = [];
  if (contractAddress) {
    const dexTpl = getTemplate("dex_volume_7d");
    if (dexTpl && isTemplateReady(dexTpl)) {
      dunePromises.push(queryDune("dex_volume_7d", dexTpl.duneQueryId, { token_address: contractAddress, chain }).catch(() => null));
      duneLabels.push("dex_volume_7d");
    }
  }
  const stableTpl = getTemplate("stablecoin_supply_trend");
  if (stableTpl && isTemplateReady(stableTpl)) {
    dunePromises.push(queryDune("stablecoin_supply_trend", stableTpl.duneQueryId, { chain }).catch(() => null));
    duneLabels.push("stablecoin_supply_trend");
  }
  const duneResultsPromise = Promise.all(dunePromises);

  for (const svc of serviceConfigs) {
    const svcStart = Date.now();
    try {
      const adapter = await getService(svc.name);
      const result = await adapter.call(svc.input, ctx);
      calls.push({ serviceName: adapter.name, data: result.data, costMicroUsdc: result.cost, paid: result.cost > 0 });
      telemetry.serviceCall({ cluster: "F", service: svc.name, latencyMs: Date.now() - svcStart, success: true, costMicroUsdc: result.cost });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unavailable";
      telemetry.serviceCall({ cluster: "F", service: svc.name, latencyMs: Date.now() - svcStart, success: false, error: msg });
      errors.push(`${svc.name}: ${msg}`);
    }
  }

  const duneResults = await duneResultsPromise;
  const duneData: Record<string, unknown> = {};
  for (let i = 0; i < duneLabels.length; i++) {
    const dr = duneResults[i] as { rows?: unknown[] } | null;
    if (dr?.rows?.length) duneData[duneLabels[i]] = dr.rows;
  }
  if (Object.keys(duneData).length > 0) {
    calls.push({ serviceName: "Dune Analytics (temporal)", data: duneData, costMicroUsdc: 0, paid: false });
  }

  const totalCost = calls.reduce((sum, c) => sum + c.costMicroUsdc, 0);
  telemetry.clusterComplete({ cluster: "F", tool: "analyze_market_trends", totalLatencyMs: Date.now() - clusterStart, servicesOk: calls.length, servicesFailed: errors.length, totalCostMicroUsdc: totalCost });

  const successNames = calls.map(c => c.serviceName);
  const failedNames = errors.map(e => e.split(":")[0]);
  const summary = successNames.length > 0
    ? `Analyzed market trends for "${query}".` + (failedNames.length > 0 ? ` Some services temporarily unavailable.` : "")
    : `Market trend analysis unavailable — all services failed.`;

  return { summary, serviceCalls: safelyTruncateServiceCalls(calls), totalCostMicroUsdc: totalCost };
}
