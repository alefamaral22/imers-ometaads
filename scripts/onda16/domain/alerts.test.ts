import { describe, it, expect } from 'vitest';
import {
  alertsForCampaign,
  buildAlertReport,
  ALERT_THRESHOLDS,
  type CampaignVitals,
} from './alerts.ts';

// Campanha "saudável" base: nenhum gatilho. Cada teste perturba um campo.
const healthy: CampaignVitals = {
  id: '1',
  name: 'Saudável',
  delivery_status: 'ACTIVE',
  spend_cents: 5000,
  impressions: 10000,
  ctr: 2.0,
  cpc_cents: 200,
  frequency: 1.5,
  results: 20,
  cost_per_result_cents: 250,
};

describe('alertsForCampaign', () => {
  it('campanha saudável não gera alertas', () => {
    expect(alertsForCampaign(healthy)).toEqual([]);
  });

  it('gasto sem resultado é CRÍTICO', () => {
    const a = alertsForCampaign({
      ...healthy,
      spend_cents: 3000,
      results: 0,
      cost_per_result_cents: null,
    });
    expect(a.some((x) => x.level === 'critical' && /sem nenhum resultado/.test(x.message))).toBe(
      true,
    );
  });

  it('frequência alta com gasto relevante é ATENÇÃO (saturação)', () => {
    const a = alertsForCampaign({ ...healthy, frequency: 4.2 });
    expect(a.some((x) => x.level === 'attention' && /saturado/.test(x.message))).toBe(true);
  });

  it('frequência alta SEM gasto relevante não alerta', () => {
    const a = alertsForCampaign({ ...healthy, frequency: 4.2, spend_cents: 100, results: 1 });
    expect(a.some((x) => /saturado/.test(x.message))).toBe(false);
  });

  it('CTR baixo só conta com volume de impressões', () => {
    const lowVol = alertsForCampaign({ ...healthy, ctr: 0.3, impressions: 500 });
    expect(lowVol.some((x) => /criativo/.test(x.message))).toBe(false);
    const highVol = alertsForCampaign({ ...healthy, ctr: 0.3, impressions: 5000 });
    expect(highVol.some((x) => x.level === 'attention' && /criativo/.test(x.message))).toBe(true);
  });

  it('custo por resultado acima do teto é ATENÇÃO', () => {
    const a = alertsForCampaign({
      ...healthy,
      cost_per_result_cents: ALERT_THRESHOLDS.highCostPerResultCents + 1,
    });
    expect(a.some((x) => /Custo por resultado/.test(x.message))).toBe(true);
  });

  it('CPC alto com gasto relevante é ATENÇÃO', () => {
    const a = alertsForCampaign({ ...healthy, cpc_cents: 900 });
    expect(a.some((x) => /CPC alto/.test(x.message))).toBe(true);
  });

  it('problema de entrega é CRÍTICO', () => {
    const a = alertsForCampaign({ ...healthy, delivery_status: 'DISAPPROVED' });
    expect(a.some((x) => x.level === 'critical' && /entrega/.test(x.message))).toBe(true);
  });

  it('null em custo/ctr/cpc/freq não dispara alertas (sem dado ≠ zero)', () => {
    const a = alertsForCampaign({
      ...healthy,
      ctr: null,
      cpc_cents: null,
      frequency: null,
      cost_per_result_cents: null,
      results: 5,
      spend_cents: 100,
    });
    expect(a).toEqual([]);
  });
});

describe('buildAlertReport', () => {
  it('conta alertas por nível na conta inteira', () => {
    const r = buildAlertReport([
      { ...healthy },
      {
        ...healthy,
        id: '2',
        name: 'Ruim',
        spend_cents: 3000,
        results: 0,
        cost_per_result_cents: null,
      },
      { ...healthy, id: '3', name: 'Saturada', frequency: 4.0 },
    ]);
    expect(r.critical).toBe(1);
    expect(r.attention).toBe(1);
    expect(r.alerts).toHaveLength(2);
  });
});
