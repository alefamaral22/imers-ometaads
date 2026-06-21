// Onda 5 — Ativação segura (SPEC §8 Onda 5 / §10): revalida e **aborta por padrão na dúvida**.
// Pura/determinística, sem I/O. Default deny: a ativação só é permitida se TODAS as checagens passam.
// Liga gasto real — por isso o viés é negar, não permitir.

import { isWithinBudgetCap } from '../../onda2/domain/budget.ts';

export type EntityStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';

export interface ActivationAdSet {
  id: string;
  meta_ad_set_id: string | null;
  status: string;
  daily_budget_cents: number | null;
}

export interface ActivationCampaign {
  id: string;
  client_id: string;
  meta_campaign_id: string | null;
  status: string;
  daily_budget_cents: number | null;
}

export interface ActivationContext {
  clientId: string;
  capCents: number;
  campaign: ActivationCampaign;
  adSets: ActivationAdSet[];
}

export interface ActivationDecision {
  allowed: boolean;
  checks: Record<string, boolean>;
  reasons: string[]; // motivos da recusa (vazio quando allowed)
}

/**
 * Avalia se a campanha pode ser ativada. Checagens (todas obrigatórias):
 *  - right_client: a campanha pertence ao cliente informado;
 *  - has_meta_id: campanha tem meta_campaign_id (existe na Meta);
 *  - currently_paused: estado atual é PAUSED (só ativamos o que está pausado);
 *  - cap_positive: teto de orçamento > 0;
 *  - has_entities: há ao menos um ad_set para ativar;
 *  - budget_within_cap: todo orçamento (campanha + ad_sets) está em 1..teto.
 * Qualquer ausência/ambiguidade → checagem falsa → recusa (default deny).
 */
export function evaluateActivation(ctx: ActivationContext): ActivationDecision {
  const checks: Record<string, boolean> = {};
  const reasons: string[] = [];

  checks.right_client = ctx.campaign.client_id === ctx.clientId;
  if (!checks.right_client) reasons.push('campanha não pertence ao cliente informado');

  checks.has_meta_id =
    typeof ctx.campaign.meta_campaign_id === 'string' && ctx.campaign.meta_campaign_id.length > 0;
  if (!checks.has_meta_id) reasons.push('campanha sem meta_campaign_id (não existe na Meta)');

  checks.currently_paused = ctx.campaign.status === 'PAUSED';
  if (!checks.currently_paused)
    reasons.push(`estado atual é ${ctx.campaign.status}, esperado PAUSED`);

  checks.cap_positive = Number.isInteger(ctx.capCents) && ctx.capCents > 0;
  if (!checks.cap_positive) reasons.push('daily_budget_cap_cents é 0 — ativação recusada');

  checks.has_entities = ctx.adSets.length > 0;
  if (!checks.has_entities) reasons.push('nenhum ad_set para ativar');

  // Reúne todos os orçamentos não-nulos (campanha CBO + ad_sets ABO). Precisa existir ao menos um e
  // todos devem respeitar o teto. Orçamento ausente em tudo = ambíguo = recusa.
  const budgets: number[] = [];
  if (ctx.campaign.daily_budget_cents !== null) budgets.push(ctx.campaign.daily_budget_cents);
  for (const a of ctx.adSets) if (a.daily_budget_cents !== null) budgets.push(a.daily_budget_cents);
  checks.budget_within_cap =
    budgets.length > 0 && budgets.every((b) => isWithinBudgetCap(b, ctx.capCents));
  if (!checks.budget_within_cap) {
    reasons.push(
      budgets.length === 0
        ? 'nenhum orçamento definido (campanha ou ad_set)'
        : 'algum orçamento viola o teto (daily_budget_cap_cents)',
    );
  }

  const allowed = Object.values(checks).every((v) => v);
  return { allowed, checks, reasons };
}

/** Patch de status para ACTIVE (aplicado na Meta e no banco só após decisão allowed). */
export function activationPatch(): { status: EntityStatus } {
  return { status: 'ACTIVE' };
}
