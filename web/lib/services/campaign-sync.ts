import 'server-only';
import { selectRows, upsertRows, patchRows } from '../db/client';
import { entityStatus } from '../domain/schemas';
import { canManageAccount, type AccountScope } from '../multitenant/scope';
import { decryptSecret, fromPgByteaHex } from '../multitenant/secrets';
import { adTokenEncKey } from '../multitenant/enc-keys';
import {
  listCampaigns,
  listCampaignInsights,
  MetaGraphError,
  type CampaignInsight,
} from '../meta/graph-client';

interface ConnectionWithCipher {
  id: string;
  account_id: string;
  client_id: string | null;
  meta_ad_account_id: string;
  access_token_cipher: string | null;
}

async function getConnectionWithCipher(id: string): Promise<ConnectionWithCipher | null> {
  const rows = await selectRows('ad_account_connections', {
    select: 'id,account_id,client_id,meta_ad_account_id,access_token_cipher',
    eq: { id },
    limit: 1,
  });
  return (rows[0] as ConnectionWithCipher | undefined) ?? null;
}

export type SyncCampaignsOutcome =
  | { status: 'synced'; imported: number }
  | { status: 'client_ambiguous' }
  | { status: 'client_required' }
  | { status: 'auth_error'; message: string }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

/**
 * Resolve o cliente que recebe as campanhas importadas (ADR 0036 §3): usa o client_id da conexão se
 * houver; senão exige que a account tenha exatamente 1 cliente. Nunca escolhe entre múltiplos.
 */
async function resolveClientId(
  connection: ConnectionWithCipher,
): Promise<
  { ok: true; clientId: string } | { ok: false; reason: 'client_ambiguous' | 'client_required' }
> {
  if (connection.client_id) return { ok: true, clientId: connection.client_id };
  const rows = await selectRows('clients', {
    select: 'id',
    eq: { account_id: connection.account_id },
  });
  if (rows.length === 0) return { ok: false, reason: 'client_required' };
  if (rows.length > 1) return { ok: false, reason: 'client_ambiguous' };
  return { ok: true, clientId: (rows[0] as { id: string }).id };
}

/**
 * Sincroniza campanhas da Meta para uma conexão (ADR 0036): lê read-only via Graph API com o token
 * decifrado em memória, faz upsert em `campaigns` por `meta_campaign_id`. Nunca muta a Meta.
 */
export async function syncCampaigns(
  scope: AccountScope,
  connectionId: string,
): Promise<SyncCampaignsOutcome> {
  const connection = await getConnectionWithCipher(connectionId);
  if (!connection) return { status: 'not_found' };
  if (!canManageAccount(scope, connection.account_id)) return { status: 'forbidden' };
  if (!connection.access_token_cipher) {
    return { status: 'error', message: 'conexão sem token armazenado' };
  }

  const resolved = await resolveClientId(connection);
  if (!resolved.ok) return { status: resolved.reason };

  let token: string;
  let campaigns;
  try {
    token = decryptSecret(fromPgByteaHex(connection.access_token_cipher), adTokenEncKey());
    campaigns = await listCampaigns(connection.meta_ad_account_id, token);
  } catch (err) {
    if (err instanceof MetaGraphError && (err.httpStatus === 401 || err.httpStatus === 403)) {
      await patchRows(
        'ad_account_connections',
        { id: connectionId },
        {
          status: 'invalid',
          last_validation_error: err.message.slice(0, 500),
        },
      );
      return { status: 'auth_error', message: 'token inválido ou revogado' };
    }
    return { status: 'error', message: err instanceof Error ? err.message : 'erro desconhecido' };
  }

  const rows = campaigns.map((c) => ({
    client_id: resolved.clientId,
    meta_campaign_id: c.id,
    meta_ad_account_id: connection.meta_ad_account_id,
    name: c.name,
    objective: c.objective,
    status: entityStatus.safeParse(c.status).success ? c.status : 'PAUSED',
    daily_budget_cents: c.daily_budget ? Number(c.daily_budget) : null,
  }));

  if (rows.length > 0) {
    await upsertRows('campaigns', rows, 'meta_campaign_id');
  }

  // Insights ao vivo (spend/impressions/clicks/results) — não bloqueia o sync de metadados: a Meta
  // pode não ter dado permissão de leitura de insights mesmo com o token válido para campanhas.
  if (rows.length > 0) {
    try {
      const insights = await listCampaignInsights(connection.meta_ad_account_id, token);
      await upsertCampaignInsights(resolved.clientId, connection.meta_ad_account_id, insights);
    } catch {
      // Best-effort: metadados já foram importados; a ausência de insights não é erro fatal do sync.
    }
  }

  await patchRows(
    'ad_account_connections',
    { id: connectionId },
    {
      status: 'active',
      last_validated_at: new Date().toISOString(),
      last_validation_error: null,
    },
  );

  return { status: 'synced', imported: rows.length };
}

/**
 * Upsert de campaign_insights (SPEC insights-meta): resolve campaign_id local pelo meta_campaign_id
 * (dado pela Meta é externo — nunca usamos o id da Meta como FK direta) e faz upsert 1 linha por
 * campanha. Campanhas sem insight na Meta (ex.: nunca rodaram) simplesmente não recebem linha.
 */
async function upsertCampaignInsights(
  clientId: string,
  metaAdAccountId: string,
  insights: readonly CampaignInsight[],
): Promise<void> {
  if (insights.length === 0) return;
  const campaignRows = await selectRows('campaigns', {
    select: 'id,meta_campaign_id',
    eq: { client_id: clientId },
  });
  const idByMetaId = new Map(
    (campaignRows as { id: string; meta_campaign_id: string | null }[])
      .filter((c) => c.meta_campaign_id)
      .map((c) => [c.meta_campaign_id as string, c.id]),
  );
  const rows = insights
    .filter((i) => idByMetaId.has(i.campaignId))
    .map((i) => ({
      campaign_id: idByMetaId.get(i.campaignId),
      meta_ad_account_id: metaAdAccountId,
      spend_cents: i.spendCents,
      impressions: i.impressions,
      clicks: i.clicks,
      results: i.results,
      ctr: i.ctr,
      cpc_cents: i.cpcCents,
      cpm_cents: i.cpmCents,
      conversations: i.conversations > 0 ? i.conversations : null,
      replies: i.replies > 0 ? i.replies : null,
      synced_at: new Date().toISOString(),
    }));
  if (rows.length > 0) {
    await upsertRows('campaign_insights', rows, 'campaign_id');
  }
}
