import 'server-only';
import { selectRows } from '../db/client';
import type { AccountScope } from '../multitenant/scope';

/**
 * Leitura read-only dos pedidos (agent_jobs) para o Nexus narrar o ANDAMENTO ao operador — acaba com o
 * "não sei se está sendo feito". O Nexus já é restrito à agência (super_admin/sócio); a leitura é
 * server-side (service_role) como todas as outras. NÃO muta nada.
 */

export interface JobStatusRow {
  id: string;
  skill: string;
  kind: string;
  status: 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export async function getRecentJobs(
  _scope: AccountScope,
  opts: { clientId?: string; kinds?: readonly string[]; limit?: number } = {},
): Promise<JobStatusRow[]> {
  const rows = await selectRows('agent_jobs', {
    select: 'id,skill,kind,status,error,created_at,finished_at',
    ...(opts.clientId ? { eq: { client_id: opts.clientId } } : {}),
    ...(opts.kinds ? { in: { kind: opts.kinds } } : {}),
    order: 'created_at.desc',
    limit: opts.limit ?? 6,
  });
  return rows as JobStatusRow[];
}

export interface LandingStatusRow {
  subdomain: string;
  url: string | null;
  status: 'draft' | 'building' | 'deployed' | 'failed';
  draft_status: 'empty' | 'generating' | 'ready' | 'editing' | 'publishing';
  updated_at: string;
}

/** Estado atual da landing page mais recente do cliente (para o Nexus dizer "ficou pronta" + link). */
export async function getLatestLanding(
  _scope: AccountScope,
  clientId?: string,
): Promise<LandingStatusRow | null> {
  const rows = await selectRows('landing_pages', {
    select: 'subdomain,url,status,draft_status,updated_at',
    ...(clientId ? { eq: { client_id: clientId } } : {}),
    order: 'updated_at.desc',
    limit: 1,
  });
  return (rows[0] as LandingStatusRow | undefined) ?? null;
}
