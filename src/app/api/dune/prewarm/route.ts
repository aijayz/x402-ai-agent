import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { triggerExecution } from "@/lib/services/dune";
import { getTemplate, isTemplateReady } from "@/lib/services/dune-templates";

export const maxDuration = 10;

// All ERC-20 addresses for the consolidated Ethereum query
const ETHEREUM_TOKEN_ADDRESSES = [
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
  "0x514910771AF9Ca656af840dff83E8264EcF986CA", // LINK
  "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", // AAVE
  "0x85f138bfEE4ef8e540890CFb48F620571d67Eda3", // AVAX (wrapped)
  "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6", // POL
];

const PREWARM_QUERIES = [
  { template: "whale_flow_ethereum", params: { token_addresses: ETHEREUM_TOKEN_ADDRESSES.join(",") } },
  { template: "whale_flow_bitcoin",  params: {} },
  { template: "whale_flow_solana",   params: {} },
  { template: "whale_flow_bnb",      params: {} },
  { template: "stablecoin_supply_trend", params: { chain: "ethereum" } },
  { template: "stablecoin_supply_trend", params: { chain: "base" } },
] as const;

export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!env.DUNE_API_KEY) {
    console.log("[DUNE:PREWARM] Skipped — no DUNE_API_KEY");
    return NextResponse.json({ status: "skipped", reason: "no DUNE_API_KEY" });
  }

  const start = Date.now();
  console.log("[DUNE:PREWARM] Starting — firing 6 executions");

  const jobs = PREWARM_QUERIES.map(({ template, params }) => {
    const tpl = getTemplate(template);
    if (!tpl || !isTemplateReady(tpl)) {
      console.warn(`[DUNE:PREWARM] Skipping ${template} — template not ready (queryId=0)`);
      return Promise.resolve({ template, params, ok: false, reason: "not_ready" as const });
    }
    const label = `${template}(${Object.values(params).join(",").slice(0, 60)})`;
    console.log(`[DUNE:PREWARM] Triggering ${label} queryId=${tpl.duneQueryId}`);
    return triggerExecution(tpl.duneQueryId, params).then((ok) => ({ template, params, ok, reason: ok ? "ok" as const : "trigger_failed" as const }));
  });

  const results = await Promise.allSettled(jobs);

  const summary = results.map((r) =>
    r.status === "fulfilled" ? r.value : { template: "unknown", ok: false, reason: "exception" as const },
  );

  const succeeded = summary.filter((r) => r.ok).length;
  const failed    = summary.filter((r) => !r.ok).length;

  console.log(`[DUNE:PREWARM] Done in ${Date.now() - start}ms — ${succeeded} triggered, ${failed} failed`);

  if (failed > 0) {
    const failures = summary.filter((r) => !r.ok).map((r) => `${r.template}(${r.reason})`);
    console.warn(`[DUNE:PREWARM] Failures: ${failures.join(", ")}`);
  }

  return NextResponse.json({
    status: failed === 0 ? "ok" : "partial",
    triggered: succeeded,
    failed,
    details: summary.map(({ template, ok, reason }) => ({ template, ok, reason })),
    durationMs: Date.now() - start,
  });
}
