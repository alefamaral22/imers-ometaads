// Espelho NO-PII em public.lp_events via PostgREST + SUPABASE_SECRET_KEY (service role, bypassa
// RLS). Upsert on_conflict=event_id, merge-duplicates => idempotente (re-enviar não duplica).
// Headless/Worker NUNCA usa o MCP do Supabase (SPEC §10).

import type { LpEventRow } from '../domain/lp-event-row.ts';

export async function upsertLpEvent(
  supabaseUrl: string,
  secretKey: string,
  row: LpEventRow,
): Promise<void> {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/lp_events?on_conflict=event_id`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`lp_events upsert failed (${res.status}): ${text}`);
  }
}
