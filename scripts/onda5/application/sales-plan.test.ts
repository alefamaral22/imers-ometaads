import { describe, expect, it } from 'vitest';
import { buildSalesPlan } from './sales-plan.ts';
import type { ClientRecord } from '../../onda2/domain/client.ts';
import type { CreativePerformance } from '../domain/top-creatives.ts';

const client: ClientRecord = {
  id: 'client-1',
  slug: 'cliente-exemplo',
  name: 'Cliente Exemplo',
  dailyBudgetCapCents: 5000,
  currency: 'BRL',
};

const creatives: CreativePerformance[] = [
  { creative_id: 'a', meta_creative_id: 'ma', purchases: 8, spend_cents: 10000 },
  { creative_id: 'b', meta_creative_id: 'mb', purchases: 3, spend_cents: 5000 },
];

describe('buildSalesPlan', () => {
  const plan = buildSalesPlan({
    client,
    stamp: '20260621T100000',
    pixelId: 'pixel-1',
    topCreatives: creatives,
  });

  it('builds an OUTCOME_SALES PAUSED plan reusing existing creatives', () => {
    expect(plan.objective).toBe('OUTCOME_SALES');
    expect(plan.status).toBe('PAUSED');
    expect(plan.ads).toHaveLength(2);
    expect(plan.reusedCreativeIds).toEqual(['a', 'b']);
    expect(plan.ads[0]?.metaCreativeId).toBe('ma');
  });

  it('clamps the budget within the cap and omits destination_type on the ad set', () => {
    expect(plan.dailyBudgetCents).toBeLessThanOrEqual(client.dailyBudgetCapCents);
    expect('destination_type' in plan.adSet).toBe(false);
    expect(plan.adSet.promoted_object.pixel_id).toBe('pixel-1');
  });

  it('aborts when there is no reusable creative', () => {
    expect(() =>
      buildSalesPlan({
        client,
        stamp: 's',
        pixelId: 'pixel-1',
        topCreatives: [{ creative_id: 'x', meta_creative_id: null, purchases: 9, spend_cents: 1 }],
      }),
    ).toThrow(/reusable/);
  });

  it('aborts when the cap is 0 (no spend allowed)', () => {
    expect(() =>
      buildSalesPlan({
        client: { ...client, dailyBudgetCapCents: 0 },
        stamp: 's',
        pixelId: 'p',
        topCreatives: creatives,
      }),
    ).toThrow();
  });
});
