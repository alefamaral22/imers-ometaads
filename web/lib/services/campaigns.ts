import 'server-only';
import { selectRows } from '../db/client';
import {
  campaignRowSchema,
  campaignInsightRowSchema,
  parseRows,
  type CampaignRow,
  type CampaignInsightRow,
} from '../domain/schemas';
import { clientScopeFilter, type AccountScope } from '../multitenant/scope';
import { accountClientIds } from './clients';

export interface CampaignWithInsight extends CampaignRow {
  insight: Pick<
    CampaignInsightRow,
    'spend_cents' | 'impressions' | 'clicks' | 'results' | 'ctr' | 'cpc_cents' | 'synced_at'
  > | null;
}

async function withInsights(campaigns: CampaignRow[]): Promise<CampaignWithInsight[]> {
  if (campaigns.length === 0) return [];
  const rows = await selectRows('campaign_insights', {
    in: { campaign_id: campaigns.map((c) => c.id) },
  });
  const insights = parseRows(campaignInsightRowSchema, rows);
  const byCampaignId = new Map(insights.map((i) => [i.campaign_id, i]));
  return campaigns.map((c) => ({ ...c, insight: byCampaignId.get(c.id) ?? null }));
}

export async function listCampaignsByClient(clientId: string): Promise<CampaignWithInsight[]> {
  const rows = await selectRows('campaigns', {
    eq: { client_id: clientId },
    order: 'created_at.desc',
  });
  return withInsights(parseRows(campaignRowSchema, rows));
}

/** Campanhas da agência escopadas por account (Onda 15): filtra pelos clientes da account. */
export async function listAllCampaigns(
  scope: AccountScope,
  limit = 200,
): Promise<CampaignWithInsight[]> {
  const filter = clientScopeFilter(await accountClientIds(scope));
  if (filter.kind === 'none') return [];
  const rows = await selectRows('campaigns', {
    order: 'created_at.desc',
    limit,
    ...(filter.kind === 'in' ? { in: { client_id: filter.clientIds } } : {}),
  });
  return withInsights(parseRows(campaignRowSchema, rows));
}
