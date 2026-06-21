// Onda 5 — REST para ativação: patch de status por id (campaigns/ad_sets/ads) via PostgREST.
// Reusa a config/segredo da Onda 2 (REST + SUPABASE_SECRET_KEY, nunca o MCP do Supabase — SPEC §10).
// Criação de vendas reusa upsertRow/insertRow da Onda 2 — aqui só o patch que faltava.

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

/** PATCH parcial de uma linha por id (ex.: status PAUSED→ACTIVE após ativação validada na Meta). */
export async function patchById(
  cfg: SupabaseRestConfig,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const endpoint = `${cfg.url.replace(/\/+$/, '')}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetchImpl(endpoint, {
    method: 'PATCH',
    headers: headers(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`patch ${table} failed (${res.status}): ${await res.text()}`);
  }
}
