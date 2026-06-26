import 'server-only';
import { selectRows } from '../db/client';
import { metricSnapshotRowSchema, parseRows, type MetricSnapshotRow } from '../domain/schemas';
import type { AccountScope } from '../multitenant/scope';
import {
  aggregateKpis,
  campaignSnapshots,
  latestAnalysisIdsByClient,
  spendSeries,
  topCampaignsBySpend,
  whatsappSummary,
  type AnalysisRef,
  type CampaignMetric,
  type Kpis,
  type MetricInput,
  type SeriesPoint,
  type WhatsAppSummary,
} from '../domain/overview-metrics';
import { listAnalyses } from './analyses';
import { listAllCampaigns } from './campaigns';

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
