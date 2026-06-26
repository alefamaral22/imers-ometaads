/**
 * Agregação pura das métricas da visão geral (SPEC-017). Sem I/O: recebe linhas já lidas/parseadas
 * e devolve o view-model do painel. Decisões em SPEC-017 §Decisões:
 *  - KPIs = última análise por cliente (evita multiplicar o gasto somando releituras das mesmas campanhas);
 *  - cliques derivados de spend/cpc (estável, independe da escala do ctr);
 *  - CTR/CPC/CPM agregados recomputados a partir dos totais (média ponderada, não média de médias).
 */

export interface MetricInput {
  analysisId: string;
  level: string;
  metaEntityId: string | null;
  impressions: number;
  spendCents: number;
  results: number;
  cpcCents: number;
  /** null em campanha não-WhatsApp; número (≥0) quando é campanha de mensagem. */
  conversations: number | null;
  replies: number | null;
}

export interface AnalysisRef {
  id: string;
  clientId: string;
  /** Instante do ponto na série (window_stop ?? created_at), ISO. */
  at: string;
}

export interface Kpis {
  spendCents: number;
  impressions: number;
  clicks: number;
  results: number;
  /** Razão 0..1 (cliques / impressões). */
  ctr: number;
  cpcCents: number;
  cpmCents: number;
  campaigns: number;
}

export interface CampaignMetric {
  metaEntityId: string;
  name: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number;
  cpcCents: number;
  cpmCents: number;
}

export interface SeriesPoint {
  at: string;
  spendCents: number;
  ctr: number;
  cpcCents: number;
}

/** Cliques de um snapshot: derivados de spend/cpc (SPEC-017 §Decisões 2). 0 sem cpc/gasto. */
export function clicksOf(m: { spendCents: number; cpcCents: number }): number {
  if (m.cpcCents <= 0 || m.spendCents <= 0) return 0;
  return Math.round(m.spendCents / m.cpcCents);
}

/** Ids das análises mais recentes por cliente (uma por client_id, a de maior `at`). */
export function latestAnalysisIdsByClient(analyses: readonly AnalysisRef[]): Set<string> {
  const latest = new Map<string, AnalysisRef>();
  for (const a of analyses) {
    const cur = latest.get(a.clientId);
    if (!cur || a.at > cur.at) latest.set(a.clientId, a);
  }
  return new Set([...latest.values()].map((a) => a.id));
}

/** Snapshots de campanha pertencentes às análises permitidas. */
export function campaignSnapshots(
  metrics: readonly MetricInput[],
  allowedAnalysisIds: ReadonlySet<string>,
): MetricInput[] {
  return metrics.filter((m) => m.level === 'campaign' && allowedAnalysisIds.has(m.analysisId));
}

/** Agrega os KPIs do topo a partir dos snapshots de campanha (média ponderada nos derivados). */
export function aggregateKpis(snapshots: readonly MetricInput[]): Kpis {
  let spendCents = 0;
  let impressions = 0;
  let clicks = 0;
  let results = 0;
  for (const s of snapshots) {
    spendCents += s.spendCents;
    impressions += s.impressions;
    results += s.results;
    clicks += clicksOf(s);
  }
  return {
    spendCents,
    impressions,
    clicks,
    results,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpcCents: clicks > 0 ? Math.round(spendCents / clicks) : 0,
    cpmCents: impressions > 0 ? Math.round((spendCents / impressions) * 1000) : 0,
    campaigns: snapshots.length,
  };
}

/** Top campanhas por gasto, rotuladas pelos nomes conhecidos (fallback: o id da Meta). */
export function topCampaignsBySpend(
  snapshots: readonly MetricInput[],
  names: ReadonlyMap<string, string>,
  limit = 5,
): CampaignMetric[] {
  return snapshots
    .map((s): CampaignMetric => {
      const clicks = clicksOf(s);
      const id = s.metaEntityId ?? '—';
      return {
        metaEntityId: id,
        name: (s.metaEntityId && names.get(s.metaEntityId)) || id,
        spendCents: s.spendCents,
        impressions: s.impressions,
        clicks,
        results: s.results,
        ctr: s.impressions > 0 ? clicks / s.impressions : 0,
        cpcCents: clicks > 0 ? Math.round(s.spendCents / clicks) : 0,
        cpmCents: s.impressions > 0 ? Math.round((s.spendCents / s.impressions) * 1000) : 0,
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, limit);
}

// ── WhatsApp / campanhas de mensagem (SPEC-017) ──────────────────────────────
// Uma campanha conta como WhatsApp quando o snapshot traz `conversations` (≠ null): a presença da
// métrica de conversa é o sinal, independente da string de objetivo. "Msgs/conversa" e "custo/conversa"
// são derivados (replies/conversations, spend/conversations) — espelham a matemática do mockup.

export interface WhatsAppCampaign {
  metaEntityId: string;
  name: string;
  spendCents: number;
  conversations: number;
  replies: number;
  costPerConversationCents: number;
  /** replies / conversations. */
  msgsPerConversation: number;
  ctr: number;
}

export interface WhatsAppSummary {
  campaigns: number;
  conversations: number;
  replies: number;
  spendCents: number;
  costPerConversationCents: number;
  msgsPerConversation: number;
  /** Fração 0..1 do gasto total que veio de campanhas de WhatsApp. */
  pctOfTotalSpend: number;
  rows: WhatsAppCampaign[];
}

/** Um snapshot é de WhatsApp/messaging quando carrega a métrica de conversa. */
export function isWhatsApp(m: MetricInput): boolean {
  return m.conversations !== null;
}

/** Resumo das campanhas de WhatsApp a partir dos snapshots de campanha, rotulado pelos nomes. */
export function whatsappSummary(
  snapshots: readonly MetricInput[],
  names: ReadonlyMap<string, string>,
  totalSpendCents: number,
): WhatsAppSummary {
  const wa = snapshots.filter(isWhatsApp);
  let spendCents = 0;
  let conversations = 0;
  let replies = 0;
  const rows = wa
    .map((s): WhatsAppCampaign => {
      const conv = s.conversations ?? 0;
      const rep = s.replies ?? 0;
      spendCents += s.spendCents;
      conversations += conv;
      replies += rep;
      const clicks = clicksOf(s);
      const id = s.metaEntityId ?? '—';
      return {
        metaEntityId: id,
        name: (s.metaEntityId && names.get(s.metaEntityId)) || id,
        spendCents: s.spendCents,
        conversations: conv,
        replies: rep,
        costPerConversationCents: conv > 0 ? Math.round(s.spendCents / conv) : 0,
        msgsPerConversation: conv > 0 ? rep / conv : 0,
        ctr: s.impressions > 0 ? clicks / s.impressions : 0,
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents);

  return {
    campaigns: wa.length,
    conversations,
    replies,
    spendCents,
    costPerConversationCents: conversations > 0 ? Math.round(spendCents / conversations) : 0,
    msgsPerConversation: conversations > 0 ? replies / conversations : 0,
    pctOfTotalSpend: totalSpendCents > 0 ? spendCents / totalSpendCents : 0,
    rows,
  };
}

/** Série temporal: um ponto por análise (ordem cronológica), agregando seus snapshots de campanha. */
export function spendSeries(
  analyses: readonly AnalysisRef[],
  metrics: readonly MetricInput[],
): SeriesPoint[] {
  const byAnalysis = new Map<string, MetricInput[]>();
  for (const m of metrics) {
    if (m.level !== 'campaign') continue;
    const list = byAnalysis.get(m.analysisId);
    if (list) list.push(m);
    else byAnalysis.set(m.analysisId, [m]);
  }
  return [...analyses]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((a): SeriesPoint => {
      const kpis = aggregateKpis(byAnalysis.get(a.id) ?? []);
      return { at: a.at, spendCents: kpis.spendCents, ctr: kpis.ctr, cpcCents: kpis.cpcCents };
    });
}
