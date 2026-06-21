// Onda 3 — Cliente REST do runner: claim atômico (RPC), patch de job, insert de agent_events.
// Headless usa REST + SUPABASE_SECRET_KEY (service_role), NUNCA o MCP do Supabase (SPEC §10).
// I/O isolado aqui; a lógica de transição/mapeamento vive em domain/ (testada).

import { RunnerError, requireString } from '../domain/validation.ts';
import { parseClaimedJob, type ClaimedJob } from '../domain/job.ts';
import type { AgentEventRow } from '../domain/agent-event.ts';

export interface RunnerConfig {
  url: string;
  secretKey: string;
  worker: string;
}

type FetchLike = typeof fetch;

/** Lê a config do ambiente. Lança se faltar — segredos nunca têm default no código. */
export function readRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  return {
    url: requireString(env.SUPABASE_URL, 'env.SUPABASE_URL').replace(/\/+$/, ''),
    secretKey: requireString(env.SUPABASE_SECRET_KEY, 'env.SUPABASE_SECRET_KEY'),
    // Identifica o worker no claim (claimed_by) — hostname da máquina Fly, ou 'runner'.
    worker: env.FLY_MACHINE_ID || env.HOSTNAME || 'runner',
  };
}

function headers(cfg: RunnerConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: cfg.secretKey,
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Claim atômico do job pendente mais antigo via RPC (FOR UPDATE SKIP LOCKED no banco). */
export async function claimAgentJob(
  cfg: RunnerConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ClaimedJob | null> {
  const res = await fetchImpl(`${cfg.url}/rest/v1/rpc/claim_agent_job`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ worker: cfg.worker }),
  });
  if (!res.ok) {
    throw new RunnerError(`claim_agent_job failed (${res.status}): ${await res.text()}`);
  }
  // A função SQL retorna a linha (objeto) ou null quando não há job pendente. Dependendo da versão
  // do PostgREST, um composite pode vir como objeto OU como array de um elemento — tolera ambos.
  const json: unknown = await res.json();
  const row = Array.isArray(json) ? (json[0] ?? null) : json;
  return parseClaimedJob(row);
}

/** PATCH parcial de um job por id. */
export async function patchAgentJob(
  cfg: RunnerConfig,
  jobId: string,
  patch: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(`${cfg.url}/rest/v1/agent_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: headers(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new RunnerError(`patch agent_jobs failed (${res.status}): ${await res.text()}`);
  }
}

/** Insere uma linha de telemetria (append-only). */
export async function insertAgentEvent(
  cfg: RunnerConfig,
  row: AgentEventRow,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(`${cfg.url}/rest/v1/agent_events`, {
    method: 'POST',
    headers: headers(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new RunnerError(`insert agent_events failed (${res.status}): ${await res.text()}`);
  }
}
