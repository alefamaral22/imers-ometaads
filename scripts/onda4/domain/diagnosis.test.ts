import { describe, expect, it } from 'vitest';
import { diagnose, overallVerdict } from './diagnosis.ts';
import { buildSnapshot } from './metrics.ts';
import { computeFunnel } from './funnel.ts';

function scenario(opts: {
  objective: string;
  impressions: number;
  spendCents: number;
  ctr: number;
  clicks: number;
  lpv?: number;
  ic?: number;
  purchase?: number;
  results?: number;
}) {
  const snapshot = buildSnapshot({
    meta_entity_id: 'e1',
    level: 'campaign',
    impressions: opts.impressions,
    spend: (opts.spendCents / 100).toFixed(2),
    clicks: opts.clicks,
    ctr: opts.ctr,
    landing_page_views: opts.lpv ?? 0,
    results: opts.results ?? 0,
  });
  const funnel = computeFunnel({
    counts: {
      impression: opts.impressions,
      link_click: opts.clicks,
      landing_page_view: opts.lpv ?? 0,
      initiate_checkout: opts.ic ?? 0,
      purchase: opts.purchase ?? 0,
    },
    spendCents: opts.spendCents,
  });
  return { snapshot, funnel };
}

describe('diagnose', () => {
  it('flags no_data when there are no impressions', () => {
    const { snapshot, funnel } = scenario({
      objective: 'OUTCOME_TRAFFIC',
      impressions: 0,
      spendCents: 0,
      ctr: 0,
      clicks: 0,
    });
    const f = diagnose('OUTCOME_TRAFFIC', snapshot, funnel);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('info');
    expect(overallVerdict([snapshot], f)).toBe('no_data');
  });

  it('marks learning when volume is insufficient', () => {
    const { snapshot, funnel } = scenario({
      objective: 'OUTCOME_TRAFFIC',
      impressions: 500,
      spendCents: 2000,
      ctr: 1,
      clicks: 5,
    });
    const f = diagnose('OUTCOME_TRAFFIC', snapshot, funnel);
    expect(f.some((x) => x.recommendation_type === 'patience')).toBe(true);
    expect(overallVerdict([snapshot], f)).toBe('learning');
  });

  it('raises a creative warning when CTR is low (crosses ctr + cpm)', () => {
    const { snapshot, funnel } = scenario({
      objective: 'OUTCOME_TRAFFIC',
      impressions: 20000,
      spendCents: 100000,
      ctr: 0.5,
      clicks: 100,
    });
    const f = diagnose('OUTCOME_TRAFFIC', snapshot, funnel);
    const creative = f.find((x) => x.recommendation_type === 'creative');
    expect(creative?.severity).toBe('warning');
    expect(creative?.is_significant).toBe(true);
    expect(overallVerdict([snapshot], f)).toBe('watch');
  });

  it('flags click→LP loss when CTR is high but LPV CVR low', () => {
    const { snapshot, funnel } = scenario({
      objective: 'OUTCOME_TRAFFIC',
      impressions: 20000,
      spendCents: 100000,
      ctr: 2,
      clicks: 400,
      lpv: 100, // 0.25 < 0.6
    });
    const f = diagnose('OUTCOME_TRAFFIC', snapshot, funnel);
    expect(f.some((x) => x.recommendation_type === 'landing_or_tracking')).toBe(true);
  });

  it('raises a critical checkout-friction finding for sales', () => {
    const { snapshot, funnel } = scenario({
      objective: 'OUTCOME_SALES',
      impressions: 50000,
      spendCents: 300000,
      ctr: 1.5,
      clicks: 800,
      lpv: 700,
      ic: 100,
      purchase: 10, // 0.1 < 0.3
      results: 10,
    });
    const f = diagnose('OUTCOME_SALES', snapshot, funnel);
    const checkout = f.find((x) => x.recommendation_type === 'checkout');
    expect(checkout?.severity).toBe('critical');
    expect(overallVerdict([snapshot], f)).toBe('underperforming');
  });

  it('emits a positive finding and healthy verdict when converting well', () => {
    const { snapshot, funnel } = scenario({
      objective: 'OUTCOME_TRAFFIC',
      impressions: 20000,
      spendCents: 100000,
      ctr: 2,
      clicks: 500,
      lpv: 450,
      results: 500,
    });
    const f = diagnose('OUTCOME_TRAFFIC', snapshot, funnel);
    expect(f.some((x) => x.severity === 'positive')).toBe(true);
    expect(overallVerdict([snapshot], f)).toBe('healthy');
  });
});
