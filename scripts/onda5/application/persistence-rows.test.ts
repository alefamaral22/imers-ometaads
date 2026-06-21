import { describe, expect, it } from 'vitest';
import { toSalesAdRow, toSalesAdSetRow, toSalesCampaignRow } from './persistence-rows.ts';
import { buildSalesPlan } from './sales-plan.ts';
import type { ClientRecord } from '../../onda2/domain/client.ts';

const client: ClientRecord = {
  id: 'client-1',
  slug: 'cliente-exemplo',
  name: 'Cliente Exemplo',
  dailyBudgetCapCents: 5000,
  currency: 'BRL',
};

const plan = buildSalesPlan({
  client,
  stamp: '20260621T100000',
  pixelId: 'pixel-1',
  topCreatives: [{ creative_id: 'a', meta_creative_id: 'ma', purchases: 8, spend_cents: 10000 }],
});

describe('sales persistence rows match the schema', () => {
  it('campaign row is OUTCOME_SALES, ABO, PAUSED', () => {
    const r = toSalesCampaignRow(plan, 'client-1', 'meta-c');
    expect(r.objective).toBe('OUTCOME_SALES');
    expect(r.budget_mode).toBe('ABO');
    expect(r.status).toBe('PAUSED');
    expect(r.meta_campaign_id).toBe('meta-c');
  });

  it('ad set row has destination_type null and cents budget', () => {
    const r = toSalesAdSetRow(plan, 'camp-uuid', 'meta-as');
    expect(r.destination_type).toBeNull();
    expect(r.campaign_id).toBe('camp-uuid');
    expect(typeof r.daily_budget_cents).toBe('number');
    expect(r.status).toBe('PAUSED');
  });

  it('ad row reuses the existing creative_id and is PAUSED', () => {
    const r = toSalesAdRow(plan.ads[0]!, 'as-uuid', 'meta-ad');
    expect(r.ad_set_id).toBe('as-uuid');
    expect(r.creative_id).toBe('a');
    expect(r.status).toBe('PAUSED');
  });
});
