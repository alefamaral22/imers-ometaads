import { describe, expect, it } from 'vitest';
import { buildAnalysisPlan, type AnalysisInput } from './analysis-plan.ts';

const input: AnalysisInput = {
  objective: 'OUTCOME_TRAFFIC',
  windowStart: '2026-06-19T00:00:00.000Z',
  windowStop: '2026-06-20T00:00:00.000Z',
  triggeredBy: 'cron',
  entities: [
    {
      level: 'campaign',
      meta_entity_id: 'camp-1',
      insights: {
        meta_entity_id: 'camp-1',
        level: 'campaign',
        impressions: 20000,
        spend: '500.00',
        clicks: 100,
        ctr: 0.5, // low → warning
        landing_page_views: 80,
        results: 100,
      },
      funnel: {
        counts: { impression: 20000, link_click: 100, landing_page_view: 80 },
        spendCents: 50000,
      },
    },
  ],
};

describe('buildAnalysisPlan', () => {
  const plan = buildAnalysisPlan(input);

  it('produces 1 snapshot and exactly 7 funnel events per entity', () => {
    expect(plan.snapshots).toHaveLength(1);
    expect(plan.funnelEvents).toHaveLength(7);
    expect(plan.funnelEvents.every((e) => e.level === 'campaign')).toBe(true);
    expect(plan.funnelEvents.map((e) => e.step_order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('aggregates verdict and writes a summary referencing it', () => {
    expect(plan.analysis.entities_analyzed).toBe(1);
    expect(plan.analysis.overall_verdict).toBe('watch');
    expect(plan.analysis.summary).toContain('watch');
  });

  it('carries findings from the diagnosis', () => {
    expect(plan.findings.some((f) => f.recommendation_type === 'creative')).toBe(true);
  });
});
