// Onda 4 — Manifest auditável da análise (SPEC §10): tentativas-geracao-de-campanhas/<stamp>-<tipo>.json.
// Sem segredos, sem PII (só contagens e veredito). Análise NÃO muta a Meta → sem operation_logs.

import type { AnalysisPlan } from './analysis-plan.ts';
import type { DailySummaryResult } from './daily-summary.ts';

export type AnalyticsKind = 'analytics' | 'daily-summary';

export interface AnalysisManifest {
  kind: 'analytics';
  clientSlug: string;
  stamp: string;
  objective: string | null;
  window: { start: string; stop: string };
  overallVerdict: string;
  counts: { entities: number; snapshots: number; findings: number; funnelEvents: number };
  metaMutations: 0; // contrato: análise é read-only na Meta
}

export interface DailySummaryManifest {
  kind: 'daily-summary';
  clientSlug: string;
  stamp: string;
  summaryDate: string;
  counts: { analyses: number };
  metaMutations: 0;
}

export function buildAnalysisManifest(
  clientSlug: string,
  stamp: string,
  plan: AnalysisPlan,
): AnalysisManifest {
  return {
    kind: 'analytics',
    clientSlug,
    stamp,
    objective: plan.analysis.objective,
    window: { start: plan.analysis.window_start, stop: plan.analysis.window_stop },
    overallVerdict: plan.analysis.overall_verdict,
    counts: {
      entities: plan.analysis.entities_analyzed,
      snapshots: plan.snapshots.length,
      findings: plan.findings.length,
      funnelEvents: plan.funnelEvents.length,
    },
    metaMutations: 0,
  };
}

export function buildDailySummaryManifest(
  clientSlug: string,
  stamp: string,
  ds: DailySummaryResult,
): DailySummaryManifest {
  return {
    kind: 'daily-summary',
    clientSlug,
    stamp,
    summaryDate: ds.summary_date,
    counts: { analyses: ds.structured.analyses },
    metaMutations: 0,
  };
}

export function manifestPath(stamp: string, kind: AnalyticsKind): string {
  return `tentativas-geracao-de-campanhas/${stamp}-${kind}.json`;
}
