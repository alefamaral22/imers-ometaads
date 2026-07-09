import 'server-only';
import { selectRows } from '../db/client';
import {
  metricSnapshotRowSchema,
  campaignInsightRowSchema,
  campaignRowSchema,
  parseRows,
  type MetricSnapshotRow,
} from '../domain/schemas';
import type { AccountScope } from '../multitenant/scope';
import {
  aggregateKpis,
  aggregateInsightKpis,
  campaignSnapshots,
  latestAnalysisIdsByClient,
  spendSeries,
  topCampaignsBySpend,
  topCampaignsByInsightSpend,
  whatsappSummary,
  whatsappSummaryFromInsights,
  type AnalysisRef,
  type CampaignInsightInput,
  type CampaignMetric,
  type Kpis,
  type MetricInput,
  type SeriesPoint,
  type WhatsAppSummary,
} from '../domain/overview-metrics';
import { listAnalyses } from './analyses';
import { listAllCampaigns } from './campaigns';
import { accountClientIds } from './clients';

/**
 * View-model do painel de métricas da visão geral (SPEC-017). Lê analyses + metric_snapshots +
 * campaigns (tudo escopado por account) e delega a agregação às funções puras de domain. Read-only.
 */
export interface OverviewMetrics {
  kpis: Kpis;
  top: CampaignMetric[];
  series: SeriesPoint[];
  whatsapp: WhatsAppSummary;
  /** Há ao menos uma análise no escopo? (distingue "sem dados" de "tudo zero"). */
  hasData: boolean;
}

const EMPTY_WHATSAPP: WhatsAppSummary = {
  campaigns: 0,
  conversations: 0,
  replies: 0,
  spendCents: 0,
  costPerConversationCents: 0,
  msgsPerConversation: 0,
  pctOfTotalSpend: 0,
  rows: [],
};

const EMPTY_KPIS: Kpis = {
  spendCents: 0,
  impressions: 0,
  clicks: 0,
  results: 0,
  ctr: 0,
  cpcCents: 0,
  cpmCents: 0,
  campaigns: 0,
};

function toMetricInput(row: MetricSnapshotRow): MetricInput {
  return {
    analysisId: row.analysis_id,
    level: row.level,
    metaEntityId: row.meta_entity_id,
    impressions: row.impressions ?? 0,
    spendCents: row.spend_cents ?? 0,
    results: row.results ?? 0,
    cpcCents: row.cpc_cents ?? 0,
    conversations: row.conversations, // mantém null → não conta como WhatsApp
    replies: row.replies,
  };
}

function toInsightInput(
  row: {
    campaign_id: string;
    spend_cents: number;
    impressions: number;
    clicks: number;
    results: number;
    cpc_cents: number | null;
    conversations?: number | null;
    replies?: number | null;
  },
  metaCampaignIdByCampaignId: ReadonlyMap<string, string | null>,
): CampaignInsightInput {
  return {
    campaignId: row.campaign_id,
    metaCampaignId: metaCampaignIdByCampaignId.get(row.campaign_id) ?? null,
    spendCents: row.spend_cents,
    impressions: row.impressions,
    clicks: row.clicks,
    results: row.results,
    cpcCents: row.cpc_cents,
    conversations: row.conversations ?? null,
    replies: row.replies ?? null,
  };
}

/**
 * Métricas "estado atual" de UMA conta de anúncio Meta, direto de campaign_insights (não depende de
 * analysis ter rodado). Alimenta o seletor de conta na Visão geral. Escopo: só devolve dados de
 * campanhas cujo cliente pertence à account do escopo (mesma regra de accountClientIds).
 */
export async function getOverviewMetricsForAdAccount(
  scope: AccountScope,
  metaAdAccountId: string,
): Promise<OverviewMetrics> {
  const campaignRows = await selectRows('campaigns', {
    eq: { meta_ad_account_id: metaAdAccountId },
    limit: 500,
  });
  const campaigns = parseRows(campaignRowSchema, campaignRows);
  if (campaigns.length === 0) {
    return { kpis: EMPTY_KPIS, top: [], series: [], whatsapp: EMPTY_WHATSAPP, hasData: false };
  }

  const allowedClientIds = await accountClientIds(scope);
  const scoped =
    allowedClientIds === null
      ? campaigns
      : campaigns.filter((c) => allowedClientIds.includes(c.client_id));
  if (scoped.length === 0) {
    return { kpis: EMPTY_KPIS, top: [], series: [], whatsapp: EMPTY_WHATSAPP, hasData: false };
  }

  const campaignIds = scoped.map((c) => c.id);
  const insightRows = await selectRows('campaign_insights', {
    in: { campaign_id: campaignIds },
    limit: 500,
  });
  const insights = parseRows(campaignInsightRowSchema, insightRows);

  const metaCampaignIdByCampaignId = new Map(scoped.map((c) => [c.id, c.meta_campaign_id]));
  const names = new Map<string, string>();
  for (const c of scoped) {
    if (c.meta_campaign_id) names.set(c.meta_campaign_id, c.name);
  }

  const inputs = insights.map((i) => toInsightInput(i, metaCampaignIdByCampaignId));
  const kpis = aggregateInsightKpis(inputs);
  const whatsapp = whatsappSummaryFromInsights(inputs, names, kpis.spendCents);
  return {
    kpis: { ...kpis, campaigns: scoped.length },
    top: topCampaignsByInsightSpend(inputs, names, 5),
    series: [],
    whatsapp,
    hasData: insights.length > 0,
  };
}

export async function getOverviewMetrics(scope: AccountScope): Promise<OverviewMetrics> {
  // Janela de análises generosa o bastante para a série temporal; as últimas por cliente viram os KPIs.
  const analysisRows = await listAnalyses(scope, 60);
  if (analysisRows.length === 0) {
    return { kpis: EMPTY_KPIS, top: [], series: [], whatsapp: EMPTY_WHATSAPP, hasData: false };
  }

  const analyses: AnalysisRef[] = analysisRows.map((a) => ({
    id: a.id,
    clientId: a.client_id,
    at: a.window_stop ?? a.created_at,
  }));

  const [snapshotRows, campaigns] = await Promise.all([
    selectRows('metric_snapshots', {
      in: { analysis_id: analyses.map((a) => a.id) },
      order: 'created_at.desc',
      limit: 2000,
    }),
    listAllCampaigns(scope, 500),
  ]);

  const metrics = parseRows(metricSnapshotRowSchema, snapshotRows).map(toMetricInput);
  const names = new Map<string, string>();
  for (const c of campaigns) {
    if (c.meta_campaign_id) names.set(c.meta_campaign_id, c.name);
  }

  const currentSnapshots = campaignSnapshots(metrics, latestAnalysisIdsByClient(analyses));
  const kpis = aggregateKpis(currentSnapshots);
  return {
    kpis,
    top: topCampaignsBySpend(currentSnapshots, names, 5),
    series: spendSeries(analyses, metrics),
    whatsapp: whatsappSummary(currentSnapshots, names, kpis.spendCents),
    hasData: true,
  };
}
