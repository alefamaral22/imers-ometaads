// Onda 4 — Funil de conversão de 7 etapas (SPEC §6 funnel_events; ADR 0025).
// Lógica pura, sem I/O: dadas as contagens cruas por etapa + gasto, calcula CVR por etapa
// (do passo anterior e do topo) e custo por evento. Money em centavos (SPEC §6).

import { costPerEventCents, safeRatio } from './money.ts';

// Ordem canônica do funil = enum public.funnel_event_type. step_order é 1..7.
export const FUNNEL_STEPS = [
  'impression',
  'link_click',
  'landing_page_view',
  'view_content',
  'add_to_cart',
  'initiate_checkout',
  'purchase',
] as const;

export type FunnelEventType = (typeof FUNNEL_STEPS)[number];
export type FunnelLevel = 'account' | 'campaign' | 'ad_set' | 'ad';

export interface FunnelInput {
  /** Contagem absoluta por etapa. Etapa ausente conta como 0. */
  counts: Partial<Record<FunnelEventType, number>>;
  /** Gasto total da entidade em centavos (denominador do custo por evento). */
  spendCents: number | null;
  /** Receita das compras em centavos (só a etapa `purchase` recebe value_cents). */
  purchaseValueCents?: number | null;
}

export interface ComputedFunnelStep {
  step_order: number;
  event_type: FunnelEventType;
  count: number;
  value_cents: number | null;
  cost_per_event_cents: number | null;
  cvr_from_prev: number | null;
  cvr_from_top: number | null;
}

/**
 * Calcula as 7 etapas do funil. Garantias:
 *  - sempre retorna exatamente 7 etapas, na ordem canônica (step_order 1..7);
 *  - topo (impression): cvr_from_prev = cvr_from_top = null (não há razão no topo);
 *  - divisão por zero/etapa ausente → razão null (não NaN, não Infinity);
 *  - value_cents só na etapa `purchase`; demais null;
 *  - cost_per_event_cents = spend/count (null se count 0 ou sem gasto).
 */
export function computeFunnel(input: FunnelInput): ComputedFunnelStep[] {
  const counts = FUNNEL_STEPS.map((step) => {
    const v = input.counts[step];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  });
  const topCount = counts[0] ?? 0;
  const spendCents = input.spendCents;
  const purchaseValue = input.purchaseValueCents ?? null;

  return FUNNEL_STEPS.map((eventType, i) => {
    const count = counts[i] ?? 0;
    const prev = i === 0 ? null : (counts[i - 1] ?? 0);
    return {
      step_order: i + 1,
      event_type: eventType,
      count,
      value_cents: eventType === 'purchase' ? purchaseValue : null,
      cost_per_event_cents: costPerEventCents(spendCents, count),
      cvr_from_prev: i === 0 ? null : safeRatio(count, prev),
      cvr_from_top: i === 0 ? null : safeRatio(count, topCount),
    };
  });
}
