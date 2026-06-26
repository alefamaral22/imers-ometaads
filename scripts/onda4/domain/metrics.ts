// Onda 4 — Snapshot de métricas por entidade (SPEC §6 metric_snapshots).
// Pura: recebe insights já achatados da Meta (a skill faz o flatten — fronteira = dado) e produz
// a linha de snapshot com derivações coerentes. Money em centavos; "sem dado" = null, não 0.

import { currencyToCents, safeRatio, toCount, costPerEventCents } from './money.ts';
import type { FunnelEventType } from './funnel.ts';

export type MetricLevel = 'campaign' | 'ad_set' | 'ad';

/** Métrica north-star por objetivo: a etapa do funil que conta como "resultado". */
export function objectiveNorthStar(objective: string | null | undefined): FunnelEventType {
  const o = (objective ?? '').toUpperCase();
  if (o.includes('SALES') || o.includes('CONVERSION') || o.includes('PURCHASE')) return 'purchase';
  if (o.includes('LEAD')) return 'view_content';
  // OUTCOME_TRAFFIC e afins: o resultado é o clique no link.
  return 'link_click';
}

/** Insights crus já achatados pela skill (cada campo é dado de fronteira, validado por tipo). */
export interface RawInsights {
  meta_entity_id: string;
  level: MetricLevel;
  impressions?: number | string | null;
  spend?: number | string | null; // unidades da moeda
  clicks?: number | string | null; // link clicks
  ctr?: number | string | null; // % como a Meta entrega
  cpc?: number | string | null; // unidades da moeda
  cpm?: number | string | null; // unidades da moeda
  landing_page_views?: number | string | null;
  results?: number | string | null; // contagem do north-star (se a skill já souber)
  conversations?: number | string | null; // conversas de mensagem iniciadas (WhatsApp/messaging)
  replies?: number | string | null; // respostas dentro das conversas
  rankings?: Record<string, unknown> | null; // quality/engagement/conversion ranking
}

export interface MetricSnapshot {
  level: MetricLevel;
  meta_entity_id: string;
  impressions: number | null;
  spend_cents: number | null;
  ctr: number | null;
  cpc_cents: number | null;
  cpm_cents: number | null;
  landing_page_views: number | null;
  cplpv_cents: number | null;
  results: number | null;
  cost_per_result_cents: number | null;
  conversations: number | null; // null em campanha não-WhatsApp (distingue "sem conversa" de "não-messaging")
  replies: number | null;
  rankings: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

/**
 * Constrói o snapshot. Derivações (só quando a Meta não entregou o campo):
 *  - ctr = clicks/impressions*100; cpc = spend/clicks; cpm = spend/impressions*1000;
 *  - cplpv = spend/landing_page_views; cost_per_result = spend/results.
 * Guarda o raw para auditoria. Nunca lança: campos ausentes viram null.
 */
export function buildSnapshot(raw: RawInsights): MetricSnapshot {
  const impressions = toCount(raw.impressions);
  const clicks = toCount(raw.clicks);
  const spendCents = currencyToCents(raw.spend);
  const lpv = toCount(raw.landing_page_views);
  const results = toCount(raw.results);
  const conversations = toCount(raw.conversations);
  const replies = toCount(raw.replies);

  const ctr =
    raw.ctr !== null && raw.ctr !== undefined && Number.isFinite(Number(raw.ctr))
      ? Number(raw.ctr)
      : impressions !== null && clicks !== null
        ? mulPct(safeRatio(clicks, impressions))
        : null;

  const cpcCents = currencyToCents(raw.cpc) ?? costPerEventCents(spendCents, clicks); // spend/clicks
  const cpmCents =
    currencyToCents(raw.cpm) ??
    (spendCents !== null && impressions !== null && impressions > 0
      ? Math.round((spendCents / impressions) * 1000)
      : null);

  return {
    level: raw.level,
    meta_entity_id: raw.meta_entity_id,
    impressions,
    spend_cents: spendCents,
    ctr,
    cpc_cents: cpcCents,
    cpm_cents: cpmCents,
    landing_page_views: lpv,
    cplpv_cents: costPerEventCents(spendCents, lpv),
    results,
    cost_per_result_cents: costPerEventCents(spendCents, results),
    conversations,
    replies,
    rankings: raw.rankings ?? null,
    raw: { ...raw },
  };
}

function mulPct(ratio: number | null): number | null {
  return ratio === null ? null : Math.round(ratio * 100 * 1e4) / 1e4;
}
