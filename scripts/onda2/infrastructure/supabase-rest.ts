// Onda 2 — Persistência via REST + SUPABASE_SECRET_KEY (PostgREST). Headless NÃO usa o MCP do
// Supabase (SPEC §10). Upsert por chave natural (Prefer: resolution=merge-duplicates) → idempotência.
// I/O isolado em infrastructure/. A lógica de montagem de payload vive no domain/application (testada).

import { requireString } from '../domain/validation.ts';

export interface SupabaseRestConfig {
  url: string; // SUPABASE_URL
  secretKey: string; // SUPABASE_SECRET_KEY (service role; bypassa RLS)
}

/** Lê a config do ambiente. Lança se faltar — segredos nunca têm default no código. */
export function readSupabaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseRestConfig {
  return {
    url: requireString(env.SUPABASE_URL, 'env.SUPABASE_URL'),
    secretKey: requireString(env.SUPABASE_SECRET_KEY, 'env.SUPABASE_SECRET_KEY'),
  };
}

type FetchLike = typeof fetch;

function restHeaders(
  cfg: SupabaseRestConfig,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    apikey: cfg.secretKey,
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Upsert de uma linha numa tabela via PostgREST, resolvendo conflito por chave natural (on_conflict).
 * merge-duplicates garante que re-rodar não duplica (idempotência).
 */
export async function upsertRow<T extends Record<string, unknown>>(
  cfg: SupabaseRestConfig,
  table: string,
  row: T,
  onConflict: string,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const endpoint = `${cfg.url.replace(/\/+$/, '')}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: restHeaders(cfg, {
      Prefer: 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upsert ${table} failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as Record<string, unknown>[];
  const first = json[0];
  if (first === undefined) throw new Error(`upsert ${table} returned no row`);
  return first;
}

/** Insere uma linha append-only (sem upsert) — usado por operation_logs. */
export async function insertRow<T extends Record<string, unknown>>(
  cfg: SupabaseRestConfig,
  table: string,
  row: T,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const endpoint = `${cfg.url.replace(/\/+$/, '')}/rest/v1/${table}`;
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: restHeaders(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`insert ${table} failed (${res.status}): ${text}`);
  }
}

/** DELETE com filtro PostgREST (ex.: apagar seções órfãs de uma LP ao regenerar). */
export async function deleteRows(
  cfg: SupabaseRestConfig,
  table: string,
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const endpoint = `${cfg.url.replace(/\/+$/, '')}/rest/v1/${table}?${query}`;
  const res = await fetchImpl(endpoint, {
    method: 'DELETE',
    headers: restHeaders(cfg, { Prefer: 'return=minimal' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`delete ${table} failed (${res.status}): ${text}`);
  }
}

/** GET com filtro PostgREST (ex.: select de clients por slug). */
export async function selectRows(
  cfg: SupabaseRestConfig,
  table: string,
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>[]> {
  const endpoint = `${cfg.url.replace(/\/+$/, '')}/rest/v1/${table}?${query}`;
  const res = await fetchImpl(endpoint, { method: 'GET', headers: restHeaders(cfg) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`select ${table} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}
