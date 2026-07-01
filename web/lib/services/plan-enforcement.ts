import 'server-only';
import { selectRows } from '../db/client';
import { checkPlanLimit } from '../plans/limits';
import { accountClientIds } from './clients';
import { hasGlobalVisibility, type AccountScope } from '../multitenant/scope';

/**
 * Onda A — enforcement base dos limites de plano. Só recai sobre a account-alvo do recurso (o cliente
 * pagante); super_admin/socio (visibilidade global = operação da agência) NÃO são limitados. O plano é
 * carregado por accounts.plan_id; limite null = ilimitado.
 */
export class PlanLimitError extends Error {
  constructor(
    public resource: 'clients' | 'landing_pages',
    public limit: number,
    public current: number,
  ) {
    super(`plan limit reached for ${resource}: ${current}/${limit}`);
    this.name = 'PlanLimitError';
  }
}

interface AccountPlanLimits {
  maxClients: number | null;
  maxLandingPages: number | null;
}

/** Lê os limites do plano vigente da account (via plan_id). Sem plano → tudo ilimitado (não bloqueia). */
async function accountPlanLimits(accountId: string): Promise<AccountPlanLimits> {
  const accRows = await selectRows('accounts', {
    select: 'plan_id',
    eq: { id: accountId },
    limit: 1,
  });
  const planId = (accRows[0] as { plan_id?: string | null } | undefined)?.plan_id ?? null;
  if (!planId) return { maxClients: null, maxLandingPages: null };

  const planRows = await selectRows('plans', {
    select: 'max_clients,max_landing_pages',
    eq: { id: planId },
    limit: 1,
  });
  const plan = planRows[0] as
    | { max_clients?: number | null; max_landing_pages?: number | null }
    | undefined;
  return {
    maxClients: plan?.max_clients ?? null,
    maxLandingPages: plan?.max_landing_pages ?? null,
  };
}

/** Conta clientes da account (via account_id). */
async function countClients(accountId: string): Promise<number> {
  const rows = await selectRows('clients', { select: 'id', eq: { account_id: accountId } });
  return rows.length;
}

/** Conta landing pages dos clientes da account. */
async function countLandingPages(clientIds: readonly string[]): Promise<number> {
  if (clientIds.length === 0) return 0;
  const rows = await selectRows('landing_pages', { select: 'id', in: { client_id: clientIds } });
  return rows.length;
}

/** Bloqueia criar cliente além do teto do plano. No-op para visibilidade global (agência). */
export async function assertWithinClientLimit(
  scope: AccountScope,
  targetAccountId: string,
): Promise<void> {
  if (hasGlobalVisibility(scope)) return;
  const { maxClients } = await accountPlanLimits(targetAccountId);
  const current = await countClients(targetAccountId);
  const check = checkPlanLimit({ limit: maxClients, current });
  if (!check.ok) throw new PlanLimitError('clients', check.limit, check.current);
}

/** Bloqueia criar LP além do teto do plano. No-op para visibilidade global (agência). */
export async function assertWithinLandingLimit(
  scope: AccountScope,
  targetAccountId: string,
): Promise<void> {
  if (hasGlobalVisibility(scope)) return;
  const { maxLandingPages } = await accountPlanLimits(targetAccountId);
  const clientIds =
    (await accountClientIds({ role: scope.role, accountId: targetAccountId })) ?? [];
  const current = await countLandingPages(clientIds);
  const check = checkPlanLimit({ limit: maxLandingPages, current });
  if (!check.ok) throw new PlanLimitError('landing_pages', check.limit, check.current);
}
