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
