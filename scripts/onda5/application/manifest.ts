// Onda 5 — Manifests auditáveis (SPEC §10): vendas e ativação. Sem segredos, sem PII.

import type { SalesPlan } from './sales-plan.ts';
import type { ActivationDecision } from '../domain/activation.ts';

export type Onda5Kind = 'sales' | 'activate';

export interface SalesManifest {
  kind: 'sales';
  clientSlug: string;
  stamp: string;
  objective: string;
  status: string;
  dailyBudgetCents: number;
  capCents: number;
  withinCap: boolean;
  reusedCreativeIds: string[];
  adsPlanned: number;
}

export interface ActivationManifest {
  kind: 'activate';
  clientSlug: string;
  stamp: string;
  campaignId: string;
  allowed: boolean;
  checks: Record<string, boolean>;
  reasons: string[];
}

export function buildSalesManifest(
  clientSlug: string,
  stamp: string,
  plan: SalesPlan,
): SalesManifest {
  return {
    kind: 'sales',
    clientSlug,
    stamp,
    objective: plan.objective,
    status: plan.status,
    dailyBudgetCents: plan.dailyBudgetCents,
    capCents: plan.capCents,
    withinCap: plan.dailyBudgetCents >= 1 && plan.dailyBudgetCents <= plan.capCents,
    reusedCreativeIds: plan.reusedCreativeIds,
    adsPlanned: plan.ads.length,
  };
}

export function buildActivationManifest(
  clientSlug: string,
  stamp: string,
  campaignId: string,
  decision: ActivationDecision,
): ActivationManifest {
  return {
    kind: 'activate',
    clientSlug,
    stamp,
    campaignId,
    allowed: decision.allowed,
    checks: decision.checks,
    reasons: decision.reasons,
  };
}

export function manifestPath(stamp: string, kind: Onda5Kind): string {
  return `tentativas-geracao-de-campanhas/${stamp}-${kind}.json`;
}
