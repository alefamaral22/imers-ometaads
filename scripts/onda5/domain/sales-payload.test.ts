import { describe, expect, it } from 'vitest';
import {
  buildSalesAdSetPayload,
  buildSalesCampaignPayload,
  SALES_OBJECTIVE,
} from './sales-payload.ts';

describe('buildSalesCampaignPayload', () => {
  it('is OUTCOME_SALES and always PAUSED', () => {
    const c = buildSalesCampaignPayload('cliente · sales · stamp');
    expect(c.objective).toBe(SALES_OBJECTIVE);
    expect(c.status).toBe('PAUSED');
    expect(c.special_ad_categories).toEqual([]);
  });
});

describe('buildSalesAdSetPayload', () => {
  it('omits destination_type entirely (Meta v25 OUTCOME_SALES gotcha)', () => {
    const a = buildSalesAdSetPayload({
      name: 'as',
      requestedDailyBudgetCents: 3000,
      capCents: 5000,
      pixelId: 'pixel-1',
    });
    expect('destination_type' in a).toBe(false);
  });

  it('sets PURCHASE promoted_object and conversion optimization', () => {
    const a = buildSalesAdSetPayload({
      name: 'as',
      requestedDailyBudgetCents: 3000,
      capCents: 5000,
      pixelId: 'pixel-1',
    });
    expect(a.promoted_object).toEqual({ pixel_id: 'pixel-1', custom_event_type: 'PURCHASE' });
    expect(a.optimization_goal).toBe('OFFSITE_CONVERSIONS');
    expect(a.status).toBe('PAUSED');
  });

  it('clamps the budget to the cap', () => {
    const a = buildSalesAdSetPayload({
      name: 'as',
      requestedDailyBudgetCents: 9999,
      capCents: 5000,
      pixelId: 'p',
    });
    expect(a.daily_budget).toBe(5000);
  });

  it('throws when the cap is 0', () => {
    expect(() =>
      buildSalesAdSetPayload({
        name: 'as',
        requestedDailyBudgetCents: 3000,
        capCents: 0,
        pixelId: 'p',
      }),
    ).toThrow();
  });

  it('throws when the pixel id is missing', () => {
    expect(() =>
      buildSalesAdSetPayload({
        name: 'as',
        requestedDailyBudgetCents: 3000,
        capCents: 5000,
        pixelId: '',
      }),
    ).toThrow(/pixel/);
  });
});
