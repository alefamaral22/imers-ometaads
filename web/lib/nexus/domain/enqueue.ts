/**
 * Nexus — montagem da linha de `agent_jobs` a partir de uma ação pendente CONFIRMADA. Pura: a
 * inserção (I/O) vive em infrastructure. A idempotência da fila é estrutural (índice único parcial
 * ≤1 job ativo por (client_id,kind) — ADR 0009); aqui só montamos a linha exata do schema.
 */

import type { PendingAction } from './confirmation';
import { compactArgs } from './args';

export interface AgentJobInsert {
  client_id: string | null;
  landing_page_id: string | null;
  skill: string;
  kind: PendingAction['kind'];
  args: Record<string, string>;
  status: 'pending';
  requested_by: string;
}

export function buildAgentJobRow(
  clientId: string | null,
  pending: PendingAction,
  requestedBy = 'nexus',
): AgentJobInsert {
  const landingPageId = pending.args.landing_page_id ?? null;
  return {
    client_id: clientId,
    landing_page_id: landingPageId,
    skill: pending.skill,
    kind: pending.kind,
    args: compactArgs(pending.args),
    status: 'pending',
    requested_by: requestedBy,
  };
}
