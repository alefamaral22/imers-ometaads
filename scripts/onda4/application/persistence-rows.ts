// Onda 4 — Montagem das linhas exatas das tabelas (SPEC §6). Sem I/O: a skill passa cada linha
// pronta para os helpers REST. Colunas batem 1:1 com as migrations de analytics e daily_summaries.

import type { AnalysisPlan, FunnelEventComputed } from './analysis-plan.ts';
import type { MetricSnapshot } from '../domain/metrics.ts';
import type { Finding } from '../domain/diagnosis.ts';
import type { DailySummaryResult } from './daily-summary.ts';

/** Linha de `analyses` (a RPC/insert devolve o id que liga os filhos). */
export function analysisRow(clientId: string, plan: AnalysisPlan): Record<string, unknown> {
  const a = plan.analysis;
  return {
    client_id: clientId,
    objective: a.objective,
    window_start: a.window_start,
    window_stop: a.window_stop,
    compare_window: a.compare_window,
    entities_analyzed: a.entities_analyzed,
    overall_verdict: a.overall_verdict,
    summary: a.summary,
    triggered_by: a.triggered_by,
    raw: { verdict: a.overall_verdict, findings: plan.findings.length },
  };
}

export function snapshotRow(analysisId: string, s: MetricSnapshot): Record<string, unknown> {
  return {
    analysis_id: analysisId,
    level: s.level,
    meta_entity_id: s.meta_entity_id,
    impressions: s.impressions,
    spend_cents: s.spend_cents,
    ctr: s.ctr,
    cpc_cents: s.cpc_cents,
    cpm_cents: s.cpm_cents,
    landing_page_views: s.landing_page_views,
    cplpv_cents: s.cplpv_cents,
    results: s.results,
    cost_per_result_cents: s.cost_per_result_cents,
    conversations: s.conversations,
    replies: s.replies,
    rankings: s.rankings,
    raw: s.raw,
  };
}

export function findingRow(analysisId: string, f: Finding): Record<string, unknown> {
  return {
    analysis_id: analysisId,
    severity: f.severity,
    diagnosis: f.diagnosis,
    evidence: f.evidence,
    recommended_action: f.recommended_action,
    recommendation_type: f.recommendation_type,
    confidence: f.confidence,
    is_significant: f.is_significant,
  };
}

export function funnelEventRow(
  analysisId: string,
  e: FunnelEventComputed,
): Record<string, unknown> {
  return {
    analysis_id: analysisId,
    level: e.level,
    meta_entity_id: e.meta_entity_id,
    step_order: e.step_order,
    event_type: e.event_type,
    count: e.count,
    value_cents: e.value_cents,
    cost_per_event_cents: e.cost_per_event_cents,
    cvr_from_prev: e.cvr_from_prev,
    cvr_from_top: e.cvr_from_top,
  };
}

/** Linha de `daily_summaries` (upsert por client_id+summary_date → idempotente). */
export function dailySummaryRow(clientId: string, ds: DailySummaryResult): Record<string, unknown> {
  return {
    client_id: clientId,
    summary_date: ds.summary_date,
    summary: ds.summary,
    structured: ds.structured,
  };
}
