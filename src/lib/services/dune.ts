import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import { env } from "@/lib/env";
import { telemetry } from "@/lib/telemetry";

const DUNE_BASE = "https://api.dune.com/api/v1";
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 30_000;
const CACHE_TTL_S = 900; // 15 minutes
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// ── Redis singleton (same pattern as rate-limit.ts) ──────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// ── Helpers ───────────────────────────────────────────────────────

function stableStringify(params: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(params).sort()));
}

function cacheKey(template: string, params: Record<string, unknown>): string {
  const hash = createHash("sha256").update(stableStringify(params)).digest("hex").slice(0, 16);
  return `dune:${template}:${hash}`;
}

function duneHeaders(): Record<string, string> {
  return { "X-Dune-API-Key": env.DUNE_API_KEY!, "Content-Type": "application/json" };
}

// ── Dune API calls ───────────────────────────────────────────────

interface DuneResult {
  rows: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

/** Try the fast path: get latest cached result from Dune (no credits consumed). */
async function getLatestResult(queryId: number, params: Record<string, unknown>): Promise<DuneResult | null> {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qp.set(k, String(v));
  }
  const url = `${DUNE_BASE}/query/${queryId}/results?${qp.toString()}`;
  const res = await fetch(url, { headers: duneHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  // Check if the execution is recent enough
  const executedAt = data.execution_ended_at ? new Date(data.execution_ended_at).getTime() : 0;
  if (Date.now() - executedAt > FRESHNESS_THRESHOLD_MS) return null;
  if (!data.result?.rows) return null;
  return { rows: data.result.rows, metadata: data.result.metadata };
}

/** Execute a query and poll for results. Consumes Dune credits. */
async function executeAndPoll(queryId: number, params: Record<string, unknown>): Promise<DuneResult | null> {
  // Execute
  const execRes = await fetch(`${DUNE_BASE}/query/${queryId}/execute`, {
    method: "POST",
    headers: duneHeaders(),
    body: JSON.stringify({ query_parameters: params }),
  });

  if (execRes.status === 402) {
    console.error("[DUNE] Credits exhausted (402)");
    const { sendTelegramAlert } = await import("@/lib/telegram");
    await sendTelegramAlert("*Dune Credits Exhausted*\\n\\nDune API returned 402. Top up credits or wait for billing reset.").catch(() => {});
    return null;
  }
  if (execRes.status === 401) {
    console.error("[DUNE] Auth failure (401) — check DUNE_API_KEY");
    return null;
  }
  if (!execRes.ok) {
    console.error(`[DUNE] Execute failed: ${execRes.status}`);
    return null;
  }

  const { execution_id } = await execRes.json();

  // Poll
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${DUNE_BASE}/execution/${execution_id}/results`, {
      headers: duneHeaders(),
    });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (pollData.is_execution_finished) {
      if (pollData.state === "QUERY_STATE_COMPLETED" && pollData.result?.rows) {
        return { rows: pollData.result.rows, metadata: pollData.result.metadata };
      }
      // Finished but failed
      console.error("[DUNE] Query execution failed", { execution_id, state: pollData.state });
      return null;
    }
  }

  console.warn("[DUNE] Poll timeout", { execution_id, queryId });
  return null;
}

// ── Public API (with cache) ──────────────────────────────────────

export interface DuneCacheResult {
  rows: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
  cacheHit: boolean;
}

/**
 * Get Dune query results with Redis caching.
 * Returns null if DUNE_API_KEY is not set, Dune is unavailable, or the query times out.
 */
export async function queryDune(
  template: string,
  queryId: number,
  params: Record<string, unknown>,
): Promise<DuneCacheResult | null> {
  if (!env.DUNE_API_KEY) {
    console.log("[DUNE] Skipped — no API key");
    return null;
  }

  const key = cacheKey(template, params);
  const start = Date.now();

  // 1. Check Redis cache
  try {
    const r = getRedis();
    if (r) {
      const cached = await r.get<DuneResult>(key);
      if (cached) {
        telemetry.duneQuery({ template, cacheHit: true, durationMs: Date.now() - start, rowCount: cached.rows.length });
        return { ...cached, cacheHit: true };
      }
    }
  } catch (err) {
    console.warn("[DUNE] Redis read error, bypassing cache", err);
  }

  // 2. Try Dune fast path (latest cached result, no credits)
  try {
    const latest = await getLatestResult(queryId, params);
    if (latest) {
      telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: latest.rows.length });
      // Cache in Redis
      try { await getRedis()?.set(key, latest, { ex: CACHE_TTL_S }); } catch {}
      return { ...latest, cacheHit: false };
    }
  } catch (err) {
    console.warn("[DUNE] Fast path failed, falling back to execute", err);
  }

  // 3. Execute + poll (consumes credits)
  try {
    const result = await executeAndPoll(queryId, params);
    if (result) {
      telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: result.rows.length });
      // Cache in Redis
      try { await getRedis()?.set(key, result, { ex: CACHE_TTL_S }); } catch {}
      return { ...result, cacheHit: false };
    }
    telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: null, error: "timeout_or_failure" });
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DUNE] Query failed", { template, error: msg });
    telemetry.duneQuery({ template, cacheHit: false, durationMs: Date.now() - start, rowCount: null, error: msg });
    return null;
  }
}
