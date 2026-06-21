import { describe, expect, it } from 'vitest';
import { selectTopCreatives, type CreativePerformance } from './top-creatives.ts';

const items: CreativePerformance[] = [
  { creative_id: 'a', meta_creative_id: 'ma', purchases: 5, spend_cents: 10000 },
  { creative_id: 'b', meta_creative_id: 'mb', purchases: 10, spend_cents: 20000 },
  { creative_id: 'c', meta_creative_id: 'mc', purchases: 10, spend_cents: 15000 }, // ties b on purchases, cheaper
  { creative_id: 'd', meta_creative_id: null, purchases: 99, spend_cents: 1 }, // no meta id → excluded
];

describe('selectTopCreatives', () => {
  it('ranks by purchases desc, then by lower spend on ties', () => {
    const top = selectTopCreatives(items, 3);
    expect(top.map((c) => c.creative_id)).toEqual(['c', 'b', 'a']);
  });

  it('excludes creatives without a meta_creative_id (cannot reuse)', () => {
    const top = selectTopCreatives(items, 10);
    expect(top.some((c) => c.creative_id === 'd')).toBe(false);
  });

  it('respects N and returns [] for non-positive N', () => {
    expect(selectTopCreatives(items, 1).map((c) => c.creative_id)).toEqual(['c']);
    expect(selectTopCreatives(items, 0)).toEqual([]);
  });
});
