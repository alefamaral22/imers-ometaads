import 'server-only';
import { selectRows, insertRows, patchRows } from '../db/client';
import { planRowSchema, parseRows, PLAN_DISPLAY_COLUMNS, type PlanRow } from '../domain/schemas';
import { writeOperationLog } from './logs';
import type { CreatePlanRequest, UpdatePlanRequest } from '../multitenant/requests';

/**
 * Server-side de public.plans (catálogo comercial). Leitura server-side (RLS fechada ao browser, ADR
 * 0026). Soft-delete via is_active — nunca hard-delete (uma account pode apontar para um plano aposentado).
 */
export async function listPlans(activeOnly = false): Promise<PlanRow[]> {
  const rows = await selectRows('plans', {
    select: PLAN_DISPLAY_COLUMNS,
    order: 'sort_order.asc',
    ...(activeOnly ? { eq: { is_active: 'true' } } : {}),
  });
  return parseRows(planRowSchema, rows);
}

export async function getPlanById(id: string): Promise<PlanRow | null> {
  const rows = await selectRows('plans', {
    select: PLAN_DISPLAY_COLUMNS,
    eq: { id },
    limit: 1,
  });
  return parseRows(planRowSchema, rows)[0] ?? null;
}

export async function createPlan(actorSlug: string, input: CreatePlanRequest): Promise<PlanRow> {
  const row = {
    slug: input.slug,
    name: input.name,
    price_cents: input.priceCents,
    currency: input.currency,
    trial_days: input.trialDays,
    max_clients: input.maxClients,
    max_landing_pages: input.maxLandingPages,
    max_campaigns: input.maxCampaigns,
    max_users: input.maxUsers,
    features: input.features,
    sort_order: input.sortOrder,
  };
  const inserted = await insertRows('plans', [row]);
  const plan = parseRows(planRowSchema, inserted)[0];
  if (!plan) throw new Error('insert plans returned no row');
  await writeOperationLog({
    entityType: 'plan',
    entityId: plan.id,
    action: 'create',
    actor: actorSlug,
    summary: `plano ${plan.slug} criado (${plan.price_cents} ${plan.currency})`,
  }).catch(() => {});
  return plan;
}

export async function updatePlan(
  actorSlug: string,
  id: string,
  input: UpdatePlanRequest,
): Promise<PlanRow> {
  // Mapeia só os campos presentes (patch parcial) para colunas snake_case.
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.priceCents !== undefined) patch.price_cents = input.priceCents;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.trialDays !== undefined) patch.trial_days = input.trialDays;
  if (input.maxClients !== undefined) patch.max_clients = input.maxClients;
  if (input.maxLandingPages !== undefined) patch.max_landing_pages = input.maxLandingPages;
  if (input.maxCampaigns !== undefined) patch.max_campaigns = input.maxCampaigns;
  if (input.maxUsers !== undefined) patch.max_users = input.maxUsers;
  if (input.features !== undefined) patch.features = input.features;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  const updated = await patchRows('plans', { id }, patch);
  const plan = parseRows(planRowSchema, updated)[0];
  if (!plan) throw new Error('patch plans returned no row');
  await writeOperationLog({
    entityType: 'plan',
    entityId: plan.id,
    action: input.isActive === false ? 'pause' : 'update',
    actor: actorSlug,
    summary: `plano ${plan.slug} atualizado`,
  }).catch(() => {});
  return plan;
}
