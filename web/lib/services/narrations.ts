import 'server-only';
import { selectRows } from '../db/client';
import { nexusNarrationRowSchema, parseRows, type NexusNarrationRow } from '../domain/schemas';

/** Server-side read of public.nexus_narrations (RLS closed to the browser, ADR 0002). */
export async function listNarrations(limit = 50): Promise<NexusNarrationRow[]> {
  const rows = await selectRows('nexus_narrations', { order: 'created_at.desc', limit });
  return parseRows(nexusNarrationRowSchema, rows);
}
