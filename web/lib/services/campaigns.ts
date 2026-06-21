import 'server-only';
import { selectRows } from '../db/client';
import { campaignRowSchema, parseRows, type CampaignRow } from '../domain/schemas';

export async function listCampaignsByClient(clientId: string): Promise<CampaignRow[]> {
  const rows = await selectRows('campaigns', {
    eq: { client_id: clientId },
    order: 'created_at.desc',
  });
  return parseRows(campaignRowSchema, rows);
}

export async function listAllCampaigns(limit = 200): Promise<CampaignRow[]> {
  const rows = await selectRows('campaigns', { order: 'created_at.desc', limit });
  return parseRows(campaignRowSchema, rows);
}
