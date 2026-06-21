import { describe, expect, it } from 'vitest';
import {
  analysisRow,
  dailySummaryRow,
  findingRow,
  funnelEventRow,
  snapshotRow,
} from './persistence-rows.ts';
import { buildAnalysisPlan } from './analysis-plan.ts';
import { buildDailySummary } from './daily-summary.ts';

const plan = buildAnalysisPlan({
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
        ctr: 0.5,
        results: 100,
      },
      funnel: { counts: { impression: 20000, link_click: 100 }, spendCents: 50000 },
    },
  ],
});

describe('persistence rows match the schema columns', () => {
  it('analysisRow carries client_id + verdict + window', () => {
    const r = analysisRow('client-uuid', plan);
    expect(r.client_id).toBe('client-uuid');
    expect(r.overall_verdict).toBe(plan.analysis.overall_verdict);
    expect(r).toHaveProperty('window_start');
    expect(r).toHaveProperty('triggered_by', 'cron');
  });

  it('snapshotRow links analysis_id and uses cents columns', () => {
    const r = snapshotRow('an-1', plan.snapshots[0]!);
    expect(r.analysis_id).toBe('an-1');
    expect(r.level).toBe('campaign');
    expect(r).toHaveProperty('spend_cents');
    expect(r).toHaveProperty('cost_per_result_cents');
  });

  it('funnelEventRow has step_order/event_type/cvr columns', () => {
    const r = funnelEventRow('an-1', plan.funnelEvents[0]!);
    expect(r.analysis_id).toBe('an-1');
    expect(r).toHaveProperty('step_order', 1);
    expect(r).toHaveProperty('event_type', 'impression');
    expect(r).toHaveProperty('cvr_from_prev');
    expect(r).toHaveProperty('cvr_from_top');
  });

  it('findingRow keeps confidence within [0,1] and severity', () => {
    const r = findingRow('an-1', plan.findings[0]!);
    expect(r.analysis_id).toBe('an-1');
    expect(typeof r.confidence).toBe('number');
    expect(r).toHaveProperty('severity');
    expect(r).toHaveProperty('is_significant');
  });

  it('dailySummaryRow upserts by client_id + summary_date', () => {
    const ds = buildDailySummary({ summaryDate: '2026-06-20', analyses: [] });
    const r = dailySummaryRow('client-uuid', ds);
    expect(r.client_id).toBe('client-uuid');
    expect(r.summary_date).toBe('2026-06-20');
    expect(r).toHaveProperty('structured');
  });
});
