// Onda 4 — Resumo diário (pura): agrega as análises do dia num upsert de daily_summaries
// (texto + structured jsonb). Idempotente por (client_id, summary_date) na persistência.

import type { Verdict } from '../domain/diagnosis.ts';

/** Digest de uma análise do dia (o que a skill extrai de `analyses` + agregados de snapshots). */
export interface AnalysisDigest {
  objective: string | null;
  overall_verdict: Verdict;
  entities_analyzed: number;
  impressions: number;
  spend_cents: number;
  results: number;
  purchase_value_cents: number;
}

export interface DailySummaryInput {
  summaryDate: string; // 'YYYY-MM-DD'
  analyses: AnalysisDigest[];
}

export interface DailySummaryStructured {
  analyses: number;
  totals: {
    impressions: number;
    spend_cents: number;
    results: number;
    purchase_value_cents: number;
    roas: number | null;
  };
  verdicts: Record<Verdict, number>;
}

export interface DailySummaryResult {
  summary_date: string;
  summary: string;
  structured: DailySummaryStructured;
}

const ZERO_VERDICTS: Record<Verdict, number> = {
  healthy: 0,
  watch: 0,
  underperforming: 0,
  learning: 0,
  no_data: 0,
  error: 0,
};

export function buildDailySummary(input: DailySummaryInput): DailySummaryResult {
  const totals = input.analyses.reduce(
    (acc, a) => ({
      impressions: acc.impressions + a.impressions,
      spend_cents: acc.spend_cents + a.spend_cents,
      results: acc.results + a.results,
      purchase_value_cents: acc.purchase_value_cents + a.purchase_value_cents,
    }),
    { impressions: 0, spend_cents: 0, results: 0, purchase_value_cents: 0 },
  );

  const verdicts: Record<Verdict, number> = { ...ZERO_VERDICTS };
  for (const a of input.analyses) verdicts[a.overall_verdict] += 1;

  // ROAS = receita / gasto (mesma unidade → adimensional). Sem gasto → null.
  const roas =
    totals.spend_cents > 0
      ? Math.round((totals.purchase_value_cents / totals.spend_cents) * 1e4) / 1e4
      : null;

  const structured: DailySummaryStructured = {
    analyses: input.analyses.length,
    totals: { ...totals, roas },
    verdicts,
  };

  const summary =
    `${input.summaryDate}: ${input.analyses.length} análise(s), ` +
    `${totals.impressions} impressões, ${(totals.spend_cents / 100).toFixed(2)} em mídia, ` +
    `${totals.results} resultado(s)` +
    (roas !== null ? `, ROAS ${roas.toFixed(2)}` : '') +
    `. Vereditos: ${describeVerdicts(verdicts)}.`;

  return { summary_date: input.summaryDate, summary, structured };
}

function describeVerdicts(verdicts: Record<Verdict, number>): string {
  const parts = (Object.entries(verdicts) as [Verdict, number][])
    .filter(([, n]) => n > 0)
    .map(([v, n]) => `${n} ${v}`);
  return parts.length > 0 ? parts.join(', ') : 'nenhum';
}
