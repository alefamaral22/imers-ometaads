// Onda 4 — REST de analytics (PostgREST). Reusa a config/segredo da Onda 2 (REST + SUPABASE_SECRET_KEY,
// nunca o MCP do Supabase — SPEC §10). `analyses` precisa do id gerado para ligar os filhos → insert
// com return=representation. Filhos append-only entram em lote (1 POST com array).

import {
  readSupabaseConfigFromEnv,
  type SupabaseRestConfig,
} from '../../onda2/infrastructure/supabase-rest.ts';

export { readSupabaseConfigFromEnv };
export type { SupabaseRestConfig };

type FetchLike = typeof fetch;

function headers(cfg: SupabaseRestConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: cfg.secretKey,
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function endpoint(cfg: SupabaseRestConfig, table: string): string {
  return `${cfg.url.replace(/\/+$/, '')}/rest/v1/${table}`;
}

/** Insere UMA linha e devolve a representação (para capturar o id de `analyses`). */
export async function insertReturning(
  cfg: SupabaseRestConfig,
  table: string,
  row: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(endpoint(cfg, table), {
    method: 'POST',
    headers: headers(cfg, { Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`insert ${table} failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as Record<string, unknown>[];
  const first = json[0];
  if (first === undefined) throw new Error(`insert ${table} returned no row`);
  return first;
}

/** Insere N linhas append-only num único POST (snapshots/findings/funnel_events). No-op se vazio. */
export async function insertMany(
  cfg: SupabaseRestConfig,
  table: string,
  rows: Record<string, unknown>[],
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetchImpl(endpoint(cfg, table), {
    method: 'POST',
    headers: headers(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`insert ${table} (bulk) failed (${res.status}): ${await res.text()}`);
  }
}
