import { describe, expect, it } from 'vitest';
import { buildDailySummary } from './daily-summary.ts';

describe('buildDailySummary', () => {
  const ds = buildDailySummary({
    summaryDate: '2026-06-20',
    analyses: [
      {
        objective: 'OUTCOME_SALES',
        overall_verdict: 'healthy',
        entities_analyzed: 2,
        impressions: 30000,
        spend_cents: 60000,
        results: 50,
        purchase_value_cents: 300000,
      },
      {
        objective: 'OUTCOME_TRAFFIC',
        overall_verdict: 'watch',
        entities_analyzed: 1,
        impressions: 10000,
        spend_cents: 20000,
        results: 200,
        purchase_value_cents: 0,
      },
    ],
  });

  it('totals spend/impressions/results across analyses', () => {
    expect(ds.structured.totals.impressions).toBe(40000);
    expect(ds.structured.totals.spend_cents).toBe(80000);
    expect(ds.structured.totals.results).toBe(250);
  });

  it('computes ROAS = revenue / spend', () => {
    expect(ds.structured.totals.roas).toBe(3.75); // 300000/80000
  });

  it('counts verdicts and writes a dated summary line', () => {
    expect(ds.structured.verdicts.healthy).toBe(1);
    expect(ds.structured.verdicts.watch).toBe(1);
    expect(ds.summary).toContain('2026-06-20');
    expect(ds.summary).toContain('ROAS');
  });

  it('ROAS is null when there is no spend', () => {
    const empty = buildDailySummary({ summaryDate: '2026-06-20', analyses: [] });
    expect(empty.structured.totals.roas).toBeNull();
    expect(empty.structured.analyses).toBe(0);
  });
});
