import { describe, expect, it } from 'vitest';
import { computeFunnel, FUNNEL_STEPS } from './funnel.ts';

describe('computeFunnel', () => {
  const base = computeFunnel({
    counts: {
      impression: 10000,
      link_click: 200,
      landing_page_view: 150,
      view_content: 120,
      add_to_cart: 40,
      initiate_checkout: 20,
      purchase: 10,
    },
    spendCents: 50000,
    purchaseValueCents: 197000,
  });

  it('always returns the 7 canonical steps in order', () => {
    expect(base.map((s) => s.event_type)).toEqual([...FUNNEL_STEPS]);
    expect(base.map((s) => s.step_order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('top step has null CVRs (no ratio at the top)', () => {
    expect(base[0]?.cvr_from_prev).toBeNull();
    expect(base[0]?.cvr_from_top).toBeNull();
  });

  it('computes cvr_from_prev and cvr_from_top', () => {
    const lpv = base[2]!; // landing_page_view
    expect(lpv.cvr_from_prev).toBe(0.75); // 150/200
    expect(lpv.cvr_from_top).toBe(0.015); // 150/10000
  });

  it('cost_per_event_cents = spend/count', () => {
    expect(base[1]?.cost_per_event_cents).toBe(250); // 50000/200
    expect(base[6]?.cost_per_event_cents).toBe(5000); // 50000/10
  });

  it('value_cents only on purchase', () => {
    expect(base[6]?.value_cents).toBe(197000);
    expect(base[0]?.value_cents).toBeNull();
    expect(base[3]?.value_cents).toBeNull();
  });

  it('missing steps count as 0 and never produce NaN/Infinity', () => {
    const sparse = computeFunnel({ counts: { impression: 0 }, spendCents: null });
    expect(sparse).toHaveLength(7);
    for (const s of sparse) {
      expect(s.count).toBe(0);
      expect(s.cost_per_event_cents).toBeNull();
      // cvr_from_top divides by topCount=0 → null (no divide-by-zero)
      expect(s.cvr_from_top).toBeNull();
    }
  });
});
