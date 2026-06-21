// Onda 5 — Payloads de campanha de VENDAS (OUTCOME_SALES). Gotchas críticos da Meta (SPEC §10):
//  - campanha SEMPRE nasce PAUSED; orçamento ≤ teto;
//  - OUTCOME_SALES **omite destination_type** (Meta v25) — a chave NÃO pode existir no payload;
//  - Advantage+ omite placements; otimização por conversões com promoted_object (pixel + PURCHASE).
// Lógica pura, testável.

import { clampDailyBudgetCents, isWithinBudgetCap } from '../../onda2/domain/budget.ts';
import { ValidationError } from '../../onda2/domain/validation.ts';

export const SALES_OBJECTIVE = 'OUTCOME_SALES' as const;
export const SALES_OPTIMIZATION_GOAL = 'OFFSITE_CONVERSIONS' as const;
export const SALES_BILLING_EVENT = 'IMPRESSIONS' as const;
export const PURCHASE_EVENT = 'PURCHASE' as const;
export const PAUSED = 'PAUSED' as const;

export interface SalesCampaignPayload {
  name: string;
  objective: typeof SALES_OBJECTIVE;
  status: typeof PAUSED;
  special_ad_categories: string[];
}

export interface SalesAdSetPayload {
  name: string;
  optimization_goal: typeof SALES_OPTIMIZATION_GOAL;
  billing_event: typeof SALES_BILLING_EVENT;
  daily_budget: number; // centavos, ≤ teto
  status: typeof PAUSED;
  promoted_object: { pixel_id: string; custom_event_type: typeof PURCHASE_EVENT };
  targeting: Record<string, unknown>;
  // destination_type é DELIBERADAMENTE omitido (gotcha OUTCOME_SALES v25). Não adicionar esta chave.
}

export function buildSalesCampaignPayload(
  name: string,
  specialAdCategories: string[] = [],
): SalesCampaignPayload {
  return {
    name,
    objective: SALES_OBJECTIVE,
    status: PAUSED, // NUNCA ACTIVE: vendas também nasce pausada (ativação é passo separado, Onda 5).
    special_ad_categories: specialAdCategories,
  };
}

export function buildSalesAdSetPayload(args: {
  name: string;
  requestedDailyBudgetCents: number;
  capCents: number;
  pixelId: string;
  targeting?: Record<string, unknown>;
}): SalesAdSetPayload {
  if (typeof args.pixelId !== 'string' || args.pixelId.length === 0) {
    throw new ValidationError('pixelId', 'pixel id is required for OUTCOME_SALES (PURCHASE)');
  }
  const dailyBudget = clampDailyBudgetCents(args.requestedDailyBudgetCents, args.capCents);
  if (!isWithinBudgetCap(dailyBudget, args.capCents)) {
    throw new ValidationError('daily_budget', 'computed budget violates daily_budget_cap_cents');
  }
  // Objeto montado SEM destination_type por design (não inclua a chave).
  return {
    name: args.name,
    optimization_goal: SALES_OPTIMIZATION_GOAL,
    billing_event: SALES_BILLING_EVENT,
    daily_budget: dailyBudget,
    status: PAUSED,
    promoted_object: { pixel_id: args.pixelId, custom_event_type: PURCHASE_EVENT },
    targeting: args.targeting ?? { geo_locations: { countries: ['BR'] } },
  };
}
