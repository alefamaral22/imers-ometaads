import 'server-only';
import { selectRows } from '../db/client';
import {
  accountRowSchema,
  operationLogRowSchema,
  parseRows,
  ACCOUNT_DISPLAY_COLUMNS,
  type AccountRow,
  type OperationLogRow,
} from '../domain/schemas';

/**
 * Leituras agregadas para o dashboard de negócio do super_admin (/admin/business). Sem RPC nova —
 * reusa as mesmas tabelas/projeções de DISPLAY dos outros serviços. Visibilidade sempre global aqui
 * (a rota já exige requireRole(['super_admin', 'socio'])), então não recebe AccountScope.
 */

export interface BusinessCounts {
  total: number;
  active: number;
  trialing: number;
  blocked: number; // past_due | canceled | paused
}

const BLOCKED_STATUSES = new Set(['past_due', 'canceled', 'paused']);

export function summarizeAccounts(accounts: readonly AccountRow[]): BusinessCounts {
  let active = 0;
  let trialing = 0;
  let blocked = 0;
  for (const a of accounts) {
    if (a.subscription_status === 'active') active++;
    else if (a.subscription_status === 'trialing') trialing++;
    else if (BLOCKED_STATUSES.has(a.subscription_status)) blocked++;
  }
  return { total: accounts.length, active, trialing, blocked };
}

/** Contas cujo trial ou período atual vence dentro de `days` dias (a partir de `now`). */
export function expiringSoon(accounts: readonly AccountRow[], now: Date, days = 7): AccountRow[] {
  const windowEnd = now.getTime() + days * 24 * 60 * 60 * 1000;
  return accounts.filter((a) => {
    const dueDate = a.current_period_end ?? a.trial_ends_at;
    if (!dueDate) return false;
    const t = new Date(dueDate).getTime();
    if (Number.isNaN(t)) return false;
    return t >= now.getTime() && t <= windowEnd;
  });
}

export async function listAccountsWithoutCredentials(
  accounts: readonly AccountRow[],
): Promise<AccountRow[]> {
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => a.id);
  const [keyRows, connRows] = await Promise.all([
    selectRows('api_keys_clientes', { select: 'account_id', in: { account_id: ids } }),
    selectRows('ad_account_connections', { select: 'account_id', in: { account_id: ids } }),
  ]);
  const withCredentials = new Set<string>();
  for (const r of keyRows) withCredentials.add((r as { account_id: string }).account_id);
  for (const r of connRows) withCredentials.add((r as { account_id: string }).account_id);
  return accounts.filter((a) => !withCredentials.has(a.id));
}

export interface BusinessDashboard {
  counts: BusinessCounts;
  expiringSoon: AccountRow[];
  withoutCredentials: AccountRow[];
  recentActivity: OperationLogRow[];
}

export async function getBusinessDashboard(now: Date): Promise<BusinessDashboard> {
  const rows = await selectRows('accounts', { select: ACCOUNT_DISPLAY_COLUMNS, order: 'name.asc' });
  const accounts = parseRows(accountRowSchema, rows);

  const [withoutCredentials, activityRows] = await Promise.all([
    listAccountsWithoutCredentials(accounts),
    selectRows('operation_logs', { order: 'created_at.desc', limit: 20 }),
  ]);

  return {
    counts: summarizeAccounts(accounts),
    expiringSoon: expiringSoon(accounts, now),
    withoutCredentials,
    recentActivity: parseRows(operationLogRowSchema, activityRows),
  };
}
