import 'server-only';
import { insertRows } from '../db/client';
import type { StartWatchInput } from '../landing/edit';

/**
 * Inicia um watch autônomo do Nexus: insere uma linha em autonomous_watches (fase inicial 'watching').
 * O runner faz polling (claim_autonomous_watch) e o avança 1 tick por vez (Onda 9). Server-side.
 */
export async function startWatch(input: StartWatchInput): Promise<{ id: string | null }> {
  const row = {
    client_id: input.client_id ?? null,
    target_kind: input.target_kind,
    target_id: input.target_id,
    agent_job_id: input.agent_job_id ?? null,
    session_id: input.session_id,
    phase: 'watching' as const,
  };
  const inserted = await insertRows('autonomous_watches', [row]);
  const first = inserted[0] as { id?: string } | undefined;
  return { id: first?.id ?? null };
}
