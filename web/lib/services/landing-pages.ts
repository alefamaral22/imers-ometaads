import 'server-only';
import { selectRows } from '../db/client';
import { landingPageRowSchema, parseRows, type LandingPageRow } from '../domain/schemas';
import { clientScopeFilter, type AccountScope } from '../multitenant/scope';
import { accountClientIds } from './clients';

/** Landing pages da agência escopadas por account (Onda 15). */
export async function listLandingPages(
  scope: AccountScope,
  limit = 200,
): Promise<LandingPageRow[]> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return [];
  const rows = await selectRows('landing_pages', {
    order: 'updated_at.desc',
    limit,
    ...(filter.kind === 'in' ? { in: { client_id: filter.clientIds } } : {}),
  });
  return parseRows(landingPageRowSchema, rows);
}

export async function listLandingPagesByClient(clientId: string): Promise<LandingPageRow[]> {
  const rows = await selectRows('landing_pages', {
    eq: { client_id: clientId },
    order: 'updated_at.desc',
  });
  return parseRows(landingPageRowSchema, rows);
}

export interface ActiveLandingCreation {
  jobId: string;
  subdomain: string;
  startedAt: string;
}

/**
 * Jobs de CRIAÇÃO de LP ainda em voo (kind=landing, não finalizados). Durante os minutos em que o
 * runner monta o rascunho, a linha em `landing_pages` ainda não existe — sem isto a aba não teria o que
 * mostrar. Escopado por account (Onda 15). O subdomínio nem sempre está nos args; caímos no
 * produto/cliente como rótulo.
 */
export async function listActiveLandingCreations(
  scope: AccountScope,
): Promise<ActiveLandingCreation[]> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return [];
  const rows = await selectRows('agent_jobs', {
    select: 'id,args,created_at',
    eq: { kind: 'landing' },
    in: {
      status: ['pending', 'claimed', 'running'],
      ...(filter.kind === 'in' ? { client_id: filter.clientIds } : {}),
    },
    order: 'created_at.desc',
  });
  return rows.map((r) => {
    const row = r as {
      id: string;
      args: { subdomain?: string; product_slug?: string; client_slug?: string } | null;
      created_at: string;
    };
    const subdomain =
      row.args?.subdomain ?? row.args?.product_slug ?? row.args?.client_slug ?? 'nova página';
    return { jobId: row.id, subdomain, startedAt: row.created_at };
  });
}
