import 'server-only';
import { insertRows } from '../../db/client';
import type { AgentJobInsert } from '../domain/enqueue';

/**
 * Insere um job na fila `agent_jobs` (server-side, service_role). A idempotência é estrutural: o
 * índice único parcial (≤1 ativo por client_id,kind — ADR 0009) faz o INSERT falhar com 409 se já
 * houver um job ativo do mesmo tipo. Tratamos isso como "já enfileirado" (não é erro fatal).
 */
export interface EnqueueResult {
  status: 'enqueued' | 'already_active';
  jobId: string | null;
}

export async function enqueueJob(row: AgentJobInsert): Promise<EnqueueResult> {
  try {
    const inserted = await insertRows('agent_jobs', [row]);
    const first = inserted[0] as { id?: string } | undefined;
    return { status: 'enqueued', jobId: first?.id ?? null };
  } catch (err) {
    // Conflito do índice único parcial = já existe um job ativo deste (client_id, kind).
    if (err instanceof Error && /\b409\b|duplicate key|unique/i.test(err.message)) {
      return { status: 'already_active', jobId: null };
    }
    throw err;
  }
}
