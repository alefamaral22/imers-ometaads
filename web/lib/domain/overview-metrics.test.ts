import { describe, it, expect } from 'vitest';
import {
  aggregateKpis,
  campaignSnapshots,
  clicksOf,
  isWhatsApp,
  latestAnalysisIdsByClient,
  spendSeries,
  topCampaignsBySpend,
  whatsappSummary,
  type AnalysisRef,
  type MetricInput,
} from './overview-metrics';

function snap(p: Partial<MetricInput> & { analysisId: string }): MetricInput {
  return {
    level: 'campaign',
    metaEntityId: 'c1',
    impressions: 0,
    spendCents: 0,
    results: 0,
    cpcCents: 0,
    conversations: null,
    replies: null,
    ...p,
  };
}

describe('clicksOf', () => {
  it('deriva cliques de spend/cpc', () => {
    expect(clicksOf({ spendCents: 1000, cpcCents: 50 })).toBe(20);
  });
  it('é 0 sem cpc ou sem gasto (campanha PAUSED)', () => {
    expect(clicksOf({ spendCents: 0, cpcCents: 0 })).toBe(0);
    expect(clicksOf({ spendCents: 1000, cpcCents: 0 })).toBe(0);
  });
});

describe('latestAnalysisIdsByClient', () => {
  it('pega a análise mais recente de cada cliente', () => {
    const analyses: AnalysisRef[] = [
      { id: 'a1', clientId: 'x', at: '2026-06-01T00:00:00Z' },
      { id: 'a2', clientId: 'x', at: '2026-06-10T00:00:00Z' },
      { id: 'a3', clientId: 'y', at: '2026-06-05T00:00:00Z' },
    ];
    expect(latestAnalysisIdsByClient(analyses)).toEqual(new Set(['a2', 'a3']));
  });
});

describe('campaignSnapshots', () => {
  it('filtra por nível campaign e por análise permitida', () => {
    const metrics = [
      snap({ analysisId: 'a1' }),
      snap({ analysisId: 'a2' }),
      snap({ analysisId: 'a1', level: 'ad' }),
    ];
    const out = campaignSnapshots(metrics, new Set(['a1']));
    expect(out).toHaveLength(1);
    expect(out[0]?.analysisId).toBe('a1');
  });
});

describe('aggregateKpis', () => {
  it('soma totais e recomputa CTR/CPC/CPM (média ponderada)', () => {
    const k = aggregateKpis([
      snap({ analysisId: 'a', impressions: 1000, spendCents: 5000, cpcCents: 50, results: 3 }),
      snap({ analysisId: 'a', impressions: 1000, spendCents: 5000, cpcCents: 100, results: 1 }),
    ]);
    // cliques: 100 + 50 = 150; impressões: 2000; gasto: 10000c
    expect(k.spendCents).toBe(10000);
    expect(k.impressions).toBe(2000);
    expect(k.clicks).toBe(150);
    expect(k.results).toBe(4);
    expect(k.ctr).toBeCloseTo(150 / 2000);
    expect(k.cpcCents).toBe(Math.round(10000 / 150));
    expect(k.cpmCents).toBe(Math.round((10000 / 2000) * 1000));
    expect(k.campaigns).toBe(2);
  });
  it('zera derivados sem impressões (conta sem gasto)', () => {
    const k = aggregateKpis([snap({ analysisId: 'a' })]);
    expect(k).toMatchObject({ spendCents: 0, impressions: 0, clicks: 0, ctr: 0, cpcCents: 0, cpmCents: 0 });
  });
});

describe('topCampaignsBySpend', () => {
  it('ordena por gasto desc e rotula pelo nome conhecido', () => {
    const metrics = [
      snap({ analysisId: 'a', metaEntityId: 'c1', spendCents: 1000, impressions: 100, cpcCents: 50 }),
      snap({ analysisId: 'a', metaEntityId: 'c2', spendCents: 3000, impressions: 200, cpcCents: 60 }),
    ];
    const top = topCampaignsBySpend(metrics, new Map([['c2', 'Campanha Dois']]), 5);
    expect(top.map((t) => t.name)).toEqual(['Campanha Dois', 'c1']);
    expect(top[0]?.spendCents).toBe(3000);
  });
});

describe('isWhatsApp / whatsappSummary', () => {
  it('só conta snapshots com conversations (≠ null) como WhatsApp', () => {
    expect(isWhatsApp(snap({ analysisId: 'a' }))).toBe(false);
    expect(isWhatsApp(snap({ analysisId: 'a', conversations: 0 }))).toBe(true);
  });

  it('agrega conversas/respostas e deriva custo/conversa, msgs/conversa e % do gasto', () => {
    const metrics = [
      // tráfego puro (não-WhatsApp): entra no total de gasto, mas não no resumo WhatsApp.
      snap({ analysisId: 'a', metaEntityId: 't1', spendCents: 4000 }),
      snap({
        analysisId: 'a',
        metaEntityId: 'w1',
        spendCents: 2000,
        impressions: 1000,
        cpcCents: 50,
        conversations: 800,
        replies: 720,
      }),
      snap({
        analysisId: 'a',
        metaEntityId: 'w2',
        spendCents: 1000,
        impressions: 500,
        cpcCents: 40,
        conversations: 200,
        replies: 180,
      }),
    ];
    const names = new Map([
      ['w1', 'WhatsApp Um'],
      ['w2', 'WhatsApp Dois'],
    ]);
    const totalSpend = 7000; // 4000 tráfego + 2000 + 1000
    const wa = whatsappSummary(metrics, names, totalSpend);

    expect(wa.campaigns).toBe(2);
    expect(wa.conversations).toBe(1000);
    expect(wa.replies).toBe(900);
    expect(wa.spendCents).toBe(3000);
    expect(wa.costPerConversationCents).toBe(3); // round(3000 / 1000)
    expect(wa.msgsPerConversation).toBeCloseTo(0.9); // 900 / 1000
    expect(wa.pctOfTotalSpend).toBeCloseTo(3000 / 7000);
    // ordenado por gasto desc, rotulado pelo nome
    expect(wa.rows.map((r) => r.name)).toEqual(['WhatsApp Um', 'WhatsApp Dois']);
    expect(wa.rows[0]?.msgsPerConversation).toBeCloseTo(720 / 800);
  });

  it('é vazio quando não há campanha de WhatsApp', () => {
    const wa = whatsappSummary([snap({ analysisId: 'a', spendCents: 100 })], new Map(), 100);
    expect(wa.campaigns).toBe(0);
    expect(wa.rows).toEqual([]);
    expect(wa.pctOfTotalSpend).toBe(0);
  });
});

describe('spendSeries', () => {
  it('emite um ponto por análise em ordem cronológica', () => {
    const analyses: AnalysisRef[] = [
      { id: 'a2', clientId: 'x', at: '2026-06-10T00:00:00Z' },
      { id: 'a1', clientId: 'x', at: '2026-06-01T00:00:00Z' },
    ];
    const metrics = [
      snap({ analysisId: 'a1', spendCents: 1000, impressions: 100, cpcCents: 50 }),
      snap({ analysisId: 'a2', spendCents: 2000, impressions: 200, cpcCents: 40 }),
    ];
    const series = spendSeries(analyses, metrics);
    expect(series.map((p) => p.at)).toEqual(['2026-06-01T00:00:00Z', '2026-06-10T00:00:00Z']);
    expect(series.map((p) => p.spendCents)).toEqual([1000, 2000]);
  });
});
