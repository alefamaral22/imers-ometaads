// Onda 4 — Diagnóstico read-only (SPEC §8 Onda 4: cruza ≥2 métricas, ancorado no north-star).
// Pura/determinística: dadas as métricas e o funil de uma entidade, emite findings explicáveis
// e um veredito agregado. Heurística com limiares nomeados (tunáveis; ver docs/specs).

import type { MetricSnapshot } from './metrics.ts';
import { objectiveNorthStar } from './metrics.ts';
import type { ComputedFunnelStep, FunnelEventType } from './funnel.ts';
import { safeRatio } from './money.ts';

export type Verdict = 'healthy' | 'watch' | 'underperforming' | 'learning' | 'no_data' | 'error';

export type FindingSeverity = 'positive' | 'info' | 'warning' | 'critical';

export interface Finding {
  severity: FindingSeverity;
  diagnosis: string;
  evidence: Record<string, unknown>;
  recommended_action: string | null;
  recommendation_type: string | null;
  confidence: number; // 0..1
  is_significant: boolean;
}

// Limiares (tunáveis; documentados na spec). Não são verdades absolutas — são gatilhos de atenção.
export const THRESHOLDS = {
  minImpressionsForSignal: 1000,
  lowCtrPct: 0.8,
  highCtrPct: 1.5,
  lpvCvrFloor: 0.6, // landing_page_view / link_click
  checkoutCvrFloor: 0.3, // purchase / initiate_checkout
} as const;

function stepCount(funnel: ComputedFunnelStep[], type: FunnelEventType): number {
  return funnel.find((s) => s.event_type === type)?.count ?? 0;
}

/** Emite findings para UMA entidade, cruzando ao menos duas métricas em cada um. */
export function diagnose(
  objective: string | null | undefined,
  snapshot: MetricSnapshot,
  funnel: ComputedFunnelStep[],
): Finding[] {
  const findings: Finding[] = [];
  const impressions = snapshot.impressions ?? 0;
  const northStar = objectiveNorthStar(objective);

  // 1) Sem dados.
  if (impressions <= 0) {
    findings.push({
      severity: 'info',
      diagnosis: 'Sem impressões no período — nada a concluir.',
      evidence: { impressions },
      recommended_action: 'Verificar se a entidade está ativa e dentro da janela analisada.',
      recommendation_type: 'data',
      confidence: 1,
      is_significant: false,
    });
    return findings;
  }

  // 2) Volume insuficiente → em aprendizado (cruza impressões + north-star).
  if (impressions < THRESHOLDS.minImpressionsForSignal) {
    findings.push({
      severity: 'info',
      diagnosis: `Volume insuficiente (${impressions} impressões) para conclusão estatística — em aprendizado.`,
      evidence: { impressions, results: snapshot.results, northStar },
      recommended_action:
        'Aguardar mais volume antes de otimizar; evitar mudanças bruscas na fase de aprendizado.',
      recommendation_type: 'patience',
      confidence: 0.8,
      is_significant: false,
    });
  }

  const ctr = snapshot.ctr;
  const clicks = stepCount(funnel, 'link_click');
  const lpv = stepCount(funnel, 'landing_page_view');
  const lpvCvr = safeRatio(lpv, clicks);

  // 3) CTR baixo com CPM presente → criativo/segmentação (cruza ctr + cpm).
  if (
    impressions >= THRESHOLDS.minImpressionsForSignal &&
    ctr !== null &&
    ctr < THRESHOLDS.lowCtrPct
  ) {
    findings.push({
      severity: 'warning',
      diagnosis: `CTR baixo (${ctr}%) — o criativo/segmentação não engajam o público.`,
      evidence: { ctr, cpm_cents: snapshot.cpm_cents, impressions },
      recommended_action:
        'Testar novos ângulos/criativos e revisar a segmentação antes de escalar.',
      recommendation_type: 'creative',
      confidence: 0.65,
      is_significant: true,
    });
  }

  // 4) Boa atração mas perda clique→LP (cruza ctr + funil lpv/click).
  if (
    ctr !== null &&
    ctr >= THRESHOLDS.highCtrPct &&
    lpvCvr !== null &&
    lpvCvr < THRESHOLDS.lpvCvrFloor &&
    clicks >= 50
  ) {
    findings.push({
      severity: 'warning',
      diagnosis: `Boa atração (CTR ${ctr}%) mas só ${Math.round(lpvCvr * 100)}% dos cliques viram landing page view — perda no clique→LP.`,
      evidence: { ctr, link_click: clicks, landing_page_view: lpv, cvr: lpvCvr },
      recommended_action:
        'Investigar velocidade/tempo de carregamento da LP e a configuração de tracking (LPV).',
      recommendation_type: 'landing_or_tracking',
      confidence: 0.7,
      is_significant: true,
    });
  }

  // 5) Vendas: chega ao checkout mas converte pouco em compra (cruza duas etapas do funil).
  if (northStar === 'purchase') {
    const ic = stepCount(funnel, 'initiate_checkout');
    const purchase = stepCount(funnel, 'purchase');
    const checkoutCvr = safeRatio(purchase, ic);
    if (ic >= 20 && checkoutCvr !== null && checkoutCvr < THRESHOLDS.checkoutCvrFloor) {
      findings.push({
        severity: 'critical',
        diagnosis: `Fricção no checkout: ${ic} checkouts iniciados, ${purchase} compras (CVR ${Math.round(checkoutCvr * 100)}%).`,
        evidence: { initiate_checkout: ic, purchase, cvr: checkoutCvr },
        recommended_action:
          'Revisar checkout (frete, métodos de pagamento, custos surpresa) e remarketing de carrinho.',
        recommendation_type: 'checkout',
        confidence: 0.75,
        is_significant: true,
      });
    }
  }

  // 6) Positivo: north-star convertendo a custo conhecido (cruza results + cost_per_result).
  if (
    (snapshot.results ?? 0) > 0 &&
    snapshot.cost_per_result_cents !== null &&
    ctr !== null &&
    ctr >= THRESHOLDS.lowCtrPct
  ) {
    findings.push({
      severity: 'positive',
      diagnosis: `North-star (${northStar}) convertendo: ${snapshot.results} resultados a ${snapshot.cost_per_result_cents}¢/resultado.`,
      evidence: {
        results: snapshot.results,
        cost_per_result_cents: snapshot.cost_per_result_cents,
        ctr,
        northStar,
      },
      recommended_action: 'Manter e considerar escalar gradualmente o orçamento (dentro do teto).',
      recommendation_type: 'scale',
      confidence: 0.6,
      is_significant: false,
    });
  }

  return findings;
}

/** Veredito agregado da análise a partir dos snapshots e de TODOS os findings das entidades. */
export function overallVerdict(snapshots: MetricSnapshot[], findings: Finding[]): Verdict {
  const totalImpressions = snapshots.reduce((acc, s) => acc + (s.impressions ?? 0), 0);
  if (snapshots.length === 0 || totalImpressions <= 0) return 'no_data';
  if (totalImpressions < THRESHOLDS.minImpressionsForSignal) return 'learning';
  if (findings.some((f) => f.severity === 'critical')) return 'underperforming';
  if (findings.some((f) => f.severity === 'warning')) return 'watch';
  return 'healthy';
}
