import { describe, expect, it } from 'vitest';
import { buildSnapshot, objectiveNorthStar } from './metrics.ts';

describe('objectiveNorthStar', () => {
  it('maps objective to its north-star step', () => {
    expect(objectiveNorthStar('OUTCOME_SALES')).toBe('purchase');
    expect(objectiveNorthStar('OUTCOME_TRAFFIC')).toBe('link_click');
    expect(objectiveNorthStar('OUTCOME_LEADS')).toBe('view_content');
    expect(objectiveNorthStar(null)).toBe('link_click');
  });
});

describe('buildSnapshot', () => {
  it('converts spend to cents and keeps Meta-provided ctr/cpc/cpm', () => {
    const s = buildSnapshot({
      meta_entity_id: '123',
      level: 'campaign',
      impressions: '10000',
      spend: '500.00',
      clicks: '200',
      ctr: 2,
      cpc: '2.50',
      cpm: '50.00',
      landing_page_views: 150,
      results: 200,
    });
    expect(s.impressions).toBe(10000);
    expect(s.spend_cents).toBe(50000);
    expect(s.ctr).toBe(2);
    expect(s.cpc_cents).toBe(250);
    expect(s.cpm_cents).toBe(5000);
    expect(s.cplpv_cents).toBe(Math.round(50000 / 150));
    expect(s.cost_per_result_cents).toBe(250);
  });

  it('derives ctr/cpc/cpm when Meta omits them', () => {
    const s = buildSnapshot({
      meta_entity_id: 'a',
      level: 'ad',
      impressions: 10000,
      spend: '100.00',
      clicks: 100,
    });
    expect(s.ctr).toBe(1); // 100/10000*100
    expect(s.cpc_cents).toBe(100); // 10000c/100
    expect(s.cpm_cents).toBe(1000); // 10000c/10000*1000
  });

  it('uses null (not 0) for missing data and keeps raw', () => {
    const s = buildSnapshot({ meta_entity_id: 'a', level: 'ad' });
    expect(s.impressions).toBeNull();
    expect(s.spend_cents).toBeNull();
    expect(s.ctr).toBeNull();
    expect(s.raw).toMatchObject({ meta_entity_id: 'a', level: 'ad' });
  });
});
