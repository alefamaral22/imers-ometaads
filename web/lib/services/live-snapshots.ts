import 'server-only';
import { selectRows } from '../db/client';
import { liveSnapshotRowSchema, parseRows, type LiveSnapshotRow } from '../domain/schemas';
import { clientScopeFilter, type AccountScope } from '../multitenant/scope';
import { accountClientIds } from './clients';

/**
 * Onda 16 — leitura dos snapshots ao vivo, SEMPRE escopada por account (ADR 0031): a perna leve do
 * híbrido grava em `live_snapshots` (pelo runner) e aqui o dashboard/Nexus lê. Nenhuma escrita: o job
 * é a única forma de produzir um snapshot. `none` (cliente sem nada no escopo) curto-circuita em null.
 */

/** O snapshot mais recente do escopo (opcionalmente filtrado por um client_id já resolvido). */
export async function getLatestSnapshot(
  scope: AccountScope,
  clientId?: string,
): Promise<LiveSnapshotRow | null> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return null;
  const rows = await selectRows('live_snapshots', {
    order: 'created_at.desc',
    limit: 1,
    // client_id explícito tem prioridade, mas só vale se estiver dentro do escopo.
    ...(clientId && (filter.kind === 'all' || filter.clientIds.includes(clientId))
      ? { eq: { client_id: clientId } }
      : filter.kind === 'in'
        ? { in: { client_id: filter.clientIds } }
        : {}),
  });
  return parseRows(liveSnapshotRowSchema, rows)[0] ?? null;
}

/** Snapshot por `job_id` (usado pelo polling da UI), escopado por account → 404 fora do escopo. */
export async function getSnapshotByJobId(
  scope: AccountScope,
  jobId: string,
): Promise<LiveSnapshotRow | null> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return null;
  const rows = await selectRows('live_snapshots', {
    eq: { job_id: jobId },
    limit: 1,
    ...(filter.kind === 'in' ? { in: { client_id: filter.clientIds } } : {}),
  });
  return parseRows(liveSnapshotRowSchema, rows)[0] ?? null;
}
