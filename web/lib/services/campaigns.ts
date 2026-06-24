import 'server-only';
import { selectRows } from '../db/client';
import { campaignRowSchema, parseRows, type CampaignRow } from '../domain/schemas';
import { clientScopeFilter, type AccountScope } from '../multitenant/scope';
import { accountClientIds } from './clients';

export async function listCampaignsByClient(clientId: string): Promise<CampaignRow[]> {
  const rows = await selectRows('campaigns', {
    eq: { client_id: clientId },
    order: 'created_at.desc',
  });
  return parseRows(campaignRowSchema, rows);
}

/** Campanhas da agência escopadas por account (Onda 15): filtra pelos clientes da account. */
export async function listAllCampaigns(scope: AccountScope, limit = 200): Promise<CampaignRow[]> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return [];
  const rows = await selectRows('campaigns', {
    order: 'created_at.desc',
    limit,
    ...(filter.kind === 'in' ? { in: { client_id: filter.clientIds } } : {}),
  });
  return parseRows(campaignRowSchema, rows);
}
