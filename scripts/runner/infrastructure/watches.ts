// Onda 9 — REST do runner para o modo autônomo: claim de watch, leitura do status do job observado e
// do último agent_event, insert de narração (append-only) e patch do watch. Reusa a config da Onda 3
// (REST + SUPABASE_SECRET_KEY, nunca o MCP do Supabase). I/O isolado; a decisão vive em onda9 (testada).

import { RunnerError, isPlainObject } from '../domain/validation.ts';
import type { RunnerConfig } from './supabase.ts';

type FetchLike = typeof fetch;

function headers(cfg: RunnerConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: cfg.secretKey,
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export interface ClaimedWatch {
  id: string;
  session_id: string | null;
  agent_job_id: string | null;
  phase: string;
  last_event_ts: string | null;
  last_narrated_milestone: string | null;
}

function parseWatch(row: unknown): ClaimedWatch | null {
  if (!isPlainObject(row)) return null;
  const id = row.id;
  if (typeof id !== 'string') return null;
  return {
    id,
    session_id: typeof row.session_id === 'string' ? row.session_id : null,
    agent_job_id: typeof row.agent_job_id === 'string' ? row.agent_job_id : null,
    phase: typeof row.phase === 'string' ? row.phase : 'watching',
    last_event_ts: typeof row.last_event_ts === 'string' ? row.last_event_ts : null,
    last_narrated_milestone:
      typeof row.last_narrated_milestone === 'string' ? row.last_narrated_milestone : null,
  };
}

export async function claimAutonomousWatch(
  cfg: RunnerConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ClaimedWatch | null> {
  const res = await fetchImpl(`${cfg.url}/rest/v1/rpc/claim_autonomous_watch`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ worker: cfg.worker }),
  });
  if (!res.ok) throw new RunnerError(`claim_autonomous_watch failed (${res.status})`);
  const json: unknown = await res.json();
  const row = Array.isArray(json) ? (json[0] ?? null) : json;
  return parseWatch(row);
}

export async function getJobStatus(
  cfg: RunnerConfig,
  jobId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const res = await fetchImpl(
    `${cfg.url}/rest/v1/agent_jobs?id=eq.${encodeURIComponent(jobId)}&select=status`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new RunnerError(`get job status failed (${res.status})`);
  const json = (await res.json()) as Array<{ status?: unknown }>;
  const status = json[0]?.status;
  return typeof status === 'string' ? status : null;
}

export async function getLatestEventTs(
  cfg: RunnerConfig,
  runId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const res = await fetchImpl(
    `${cfg.url}/rest/v1/agent_events?run_id=eq.${encodeURIComponent(runId)}&select=created_at&order=created_at.desc&limit=1`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new RunnerError(`get latest event failed (${res.status})`);
  const json = (await res.json()) as Array<{ created_at?: unknown }>;
  const ts = json[0]?.created_at;
  return typeof ts === 'string' ? ts : null;
}

export async function insertNarration(
  cfg: RunnerConfig,
  row: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(`${cfg.url}/rest/v1/nexus_narrations`, {
    method: 'POST',
    headers: headers(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new RunnerError(`insert narration failed (${res.status})`);
}

export async function patchWatch(
  cfg: RunnerConfig,
  watchId: string,
  patch: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const res = await fetchImpl(
    `${cfg.url}/rest/v1/autonomous_watches?id=eq.${encodeURIComponent(watchId)}`,
    {
      method: 'PATCH',
      headers: headers(cfg, { Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new RunnerError(`patch watch failed (${res.status})`);
}
