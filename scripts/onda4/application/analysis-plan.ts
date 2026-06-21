// Onda 4 — Plano de análise (pura): junta snapshots + funil + findings de N entidades numa
// análise coerente, com veredito agregado e resumo textual. O executor (skill) só persiste.

import { buildSnapshot, type MetricSnapshot, type RawInsights } from '../domain/metrics.ts';
import {
  computeFunnel,
  type ComputedFunnelStep,
  type FunnelInput,
  type FunnelLevel,
} from '../domain/funnel.ts';
import { diagnose, overallVerdict, type Finding, type Verdict } from '../domain/diagnosis.ts';

export interface EntityInput {
  level: FunnelLevel;
  meta_entity_id: string | null;
  insights: RawInsights;
  funnel: FunnelInput;
}

export interface AnalysisInput {
  objective: string | null;
  windowStart: string; // ISO
  windowStop: string; // ISO
  compareWindow?: string | null;
  triggeredBy: string; // 'cron' | 'nexus' | ...
  entities: EntityInput[];
}

export interface FunnelEventComputed extends ComputedFunnelStep {
  level: FunnelLevel;
  meta_entity_id: string | null;
}

export interface AnalysisHeader {
  objective: string | null;
  window_start: string;
  window_stop: string;
  compare_window: string | null;
  entities_analyzed: number;
  overall_verdict: Verdict;
  summary: string;
  triggered_by: string;
}

export interface AnalysisPlan {
  analysis: AnalysisHeader;
  snapshots: MetricSnapshot[];
  findings: Finding[];
  funnelEvents: FunnelEventComputed[];
}

/** Monta o plano completo. Cada entidade gera: 1 snapshot + 7 funnel_events + 0..N findings. */
export function buildAnalysisPlan(input: AnalysisInput): AnalysisPlan {
  const snapshots: MetricSnapshot[] = [];
  const findings: Finding[] = [];
  const funnelEvents: FunnelEventComputed[] = [];

  for (const entity of input.entities) {
    const snapshot = buildSnapshot(entity.insights);
    const funnel = computeFunnel(entity.funnel);
    snapshots.push(snapshot);
    for (const step of funnel) {
      funnelEvents.push({ ...step, level: entity.level, meta_entity_id: entity.meta_entity_id });
    }
    for (const f of diagnose(input.objective, snapshot, funnel)) {
      findings.push(f);
    }
  }

  const verdict = overallVerdict(snapshots, findings);
  return {
    analysis: {
      objective: input.objective,
      window_start: input.windowStart,
      window_stop: input.windowStop,
      compare_window: input.compareWindow ?? null,
      entities_analyzed: input.entities.length,
      overall_verdict: verdict,
      summary: summarize(verdict, snapshots, findings),
      triggered_by: input.triggeredBy,
    },
    snapshots,
    findings,
    funnelEvents,
  };
}

function summarize(verdict: Verdict, snapshots: MetricSnapshot[], findings: Finding[]): string {
  const impressions = snapshots.reduce((a, s) => a + (s.impressions ?? 0), 0);
  const spendCents = snapshots.reduce((a, s) => a + (s.spend_cents ?? 0), 0);
  const results = snapshots.reduce((a, s) => a + (s.results ?? 0), 0);
  const criticals = findings.filter((f) => f.severity === 'critical').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const headline =
    findings.find((f) => f.severity === 'critical')?.diagnosis ??
    findings.find((f) => f.severity === 'warning')?.diagnosis ??
    findings.find((f) => f.severity === 'positive')?.diagnosis ??
    'Sem achados relevantes no período.';
  return (
    `Veredito: ${verdict}. ${snapshots.length} entidade(s), ${impressions} impressões, ` +
    `${(spendCents / 100).toFixed(2)} em mídia, ${results} resultado(s). ` +
    `${criticals} crítico(s), ${warnings} alerta(s). ${headline}`
  );
}
