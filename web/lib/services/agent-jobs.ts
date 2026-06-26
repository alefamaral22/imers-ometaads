import 'server-only';
import { selectRows } from '../db/client';
import { scopeEq, type AccountScope } from '../multitenant/scope';

/**
 * Pulso dos agentes (SPEC-018) — jobs em voo na fila `agent_jobs`, escopados por account (super_admin/
 * socio veem tudo; cliente_usuario só os seus, via account_id). Read-only. Alimenta o efeito "agentes
 * trabalhando" do console Operação ao vivo: quando `active > 0`, o arc reactor intensifica.
 */

const ACTIVE_STATUSES = ['pending', 'claimed', 'running'] as const;

export interface ActiveJob {
  id: string;
  skill: string;
  kind: string | null;
  status: string;
  createdAt: string;
}

export interface AgentPulse {
  active: number;
  jobs: ActiveJob[];
}

export async function getAgentPulse(scope: AccountScope): Promise<AgentPulse> {
  const eq = scopeEq(scope); // null = visibilidade global; senão { account_id }
  const rows = await selectRows('agent_jobs', {
    select: 'id,skill,kind,status,created_at',
    // PostgREST: status=in.(pending,claimed,running)
    in: { status: ACTIVE_STATUSES },
    order: 'created_at.desc',
    limit: 50,
    ...(eq ? { eq } : {}),
  });
  const jobs: ActiveJob[] = (Array.isArray(rows) ? rows : []).map((r) => {
    const row = r as { id: string; skill: string; kind: string | null; status: string; created_at: string };
    return {
      id: row.id,
      skill: row.skill,
      kind: row.kind ?? null,
      status: row.status,
      createdAt: row.created_at,
    };
  });
  return { active: jobs.length, jobs };
}
