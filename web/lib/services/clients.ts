import 'server-only';
import { selectRows } from '../db/client';
import { clientRowSchema, parseRows, type ClientRow } from '../domain/schemas';

/** Server-side reads of public.clients. RLS is closed to the browser (ADR 0002). */
export async function listClients(): Promise<ClientRow[]> {
  const rows = await selectRows('clients', { order: 'name.asc' });
  return parseRows(clientRowSchema, rows);
}

export async function getClientBySlug(slug: string): Promise<ClientRow | null> {
  const rows = await selectRows('clients', { eq: { slug }, limit: 1 });
  const parsed = parseRows(clientRowSchema, rows);
  return parsed[0] ?? null;
}
