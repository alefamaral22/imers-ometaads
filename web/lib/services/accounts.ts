import 'server-only';
import { selectRows, patchRows, insertRows } from '../db/client';
import {
  accountRowSchema,
  planChangeRowSchema,
  parseRows,
  ACCOUNT_DISPLAY_COLUMNS,
  type AccountRow,
  type PlanChangeRow,
} from '../domain/schemas';
import { readSession } from '../auth/server';
import { scopeFromClaims, type AccountScope } from '../multitenant/scope';
import { hashPassword } from '../auth/password';
import { buildAccountInsertRow, type ProvisionableRole } from '../multitenant/accounts-admin';
import { writeOperationLog } from './logs';
import type { AccountRole } from '../auth/domain';

/**
 * Server-side reads of public.accounts (RLS closed to the browser, ADR 0002/0026). Reads project the
 * DISPLAY columns (never password_hash → o hash nunca sai do servidor). A query de login (abaixo) lê o
 * password_hash, mas ele fica server-side e nunca volta na resposta.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  const rows = await selectRows('accounts', {
    select: ACCOUNT_DISPLAY_COLUMNS,
    order: 'created_at.asc',
  });
  return parseRows(accountRowSchema, rows);
}

/** Scope da sessão atual (ADR 0029). Lança se não houver sessão — chamado atrás de requireOperator. */
export async function getCurrentScope(): Promise<AccountScope> {
  const claims = await readSession();
  if (!claims) throw new Error('no session');
  return scopeFromClaims(claims);
}

export interface LoginAccount {
  id: string;
  role: AccountRole;
  slug: string;
  passwordHash: string | null;
}

/** Resolve uma account ativa por email para o login. password_hash fica server-side (nunca exposto). */
export async function getLoginAccountByEmail(email: string): Promise<LoginAccount | null> {
  const rows = await selectRows('accounts', {
    select: 'id,role,slug,password_hash',
    eq: { email, is_active: 'true' },
    limit: 1,
  });
  const row = rows[0] as
    | { id?: string; role?: AccountRole; slug?: string; password_hash?: string | null }
    | undefined;
  if (!row?.id || !row.role || !row.slug) return null;
  return { id: row.id, role: row.role, slug: row.slug, passwordHash: row.password_hash ?? null };
}

/** A account-âncora super_admin — usada pelo bootstrap legado (DASHBOARD_PASSWORD). */
export async function getSuperAdminAnchor(): Promise<{
  id: string;
  role: AccountRole;
  slug: string;
} | null> {
  const rows = await selectRows('accounts', {
    select: 'id,role,slug',
    eq: { role: 'super_admin', is_active: 'true' },
    limit: 1,
  });
  const row = rows[0] as { id?: string; role?: AccountRole; slug?: string } | undefined;
  if (!row?.id || !row.role || !row.slug) return null;
  return { id: row.id, role: row.role, slug: row.slug };
}

/** Marca o último login (best-effort; não bloqueia o fluxo se falhar). */
export async function touchLastLogin(accountId: string): Promise<void> {
  await patchRows('accounts', { id: accountId }, { last_login_at: new Date().toISOString() });
}

// ── Onda 14 — provisionamento pelo super_admin (mutações atrás de requireRole(['super_admin'])) ──

export interface AdminCreateAccountInput {
  slug: string;
  name: string;
  role: ProvisionableRole;
  plan: string;
  email: string;
  password: string;
}

/** Cria uma account com hash scrypt. A resposta (parse por accountRowSchema) NÃO tem password_hash. */
export async function createAccount(
  actorSlug: string,
  input: AdminCreateAccountInput,
): Promise<AccountRow> {
  const row = buildAccountInsertRow(
    { slug: input.slug, name: input.name, role: input.role, plan: input.plan, email: input.email },
    hashPassword(input.password),
  );
  const inserted = await insertRows('accounts', [row]);
  const account = parseRows(accountRowSchema, inserted)[0];
  if (!account) throw new Error('insert accounts returned no row');
  await writeOperationLog({
    entityType: 'account',
    entityId: account.id,
    action: 'create',
    actor: actorSlug,
    summary: `account ${account.slug} criada (${account.role}/${account.plan})`,
  }).catch(() => {});
  return account;
}

/** Lê id+role+slug de uma account (para a guarda canToggleAccount antes de mutar). */
export async function getAccountById(
  id: string,
): Promise<{ id: string; role: AccountRole; slug: string } | null> {
  const rows = await selectRows('accounts', { select: 'id,role,slug', eq: { id }, limit: 1 });
  const row = rows[0] as { id?: string; role?: AccountRole; slug?: string } | undefined;
  if (!row?.id || !row.role || !row.slug) return null;
  return { id: row.id, role: row.role, slug: row.slug };
}

/** Ativa/desativa uma account (soft). Desativar corta o login imediatamente. Audita a ação. */
export async function setAccountActive(
  actorSlug: string,
  accountId: string,
  isActive: boolean,
): Promise<AccountRow> {
  const updated = await patchRows('accounts', { id: accountId }, { is_active: isActive });
  const account = parseRows(accountRowSchema, updated)[0];
  if (!account) throw new Error('patch accounts returned no row');
  await writeOperationLog({
    entityType: 'account',
    entityId: account.id,
    action: isActive ? 'activate' : 'pause',
    actor: actorSlug,
    summary: `account ${account.slug} ${isActive ? 'reativada' : 'desativada'}`,
  }).catch(() => {});
  return account;
}

// ── Onda A — atribuição/troca de plano com trilha de auditoria (plan_changes) ──

/** Troca o plano de uma account: patch plan_id + append em plan_changes + audita. */
export async function assignPlan(
  actorSlug: string,
  accountId: string,
  toPlanId: string,
  reason?: string,
): Promise<AccountRow> {
  // Lê o plano atual para registrar from_plan_id no histórico (pode ser null na primeira atribuição).
  const current = await selectRows('accounts', {
    select: 'plan_id',
    eq: { id: accountId },
    limit: 1,
  });
  const fromPlanId = (current[0] as { plan_id?: string | null } | undefined)?.plan_id ?? null;

  const updated = await patchRows('accounts', { id: accountId }, { plan_id: toPlanId });
  const account = parseRows(accountRowSchema, updated)[0];
  if (!account) throw new Error('patch accounts returned no row');

  await insertRows('plan_changes', [
    {
      account_id: accountId,
      from_plan_id: fromPlanId,
      to_plan_id: toPlanId,
      changed_by: actorSlug,
      reason: reason ?? null,
    },
  ]);
  await writeOperationLog({
    entityType: 'account',
    entityId: account.id,
    action: 'update',
    actor: actorSlug,
    summary: `plano da account ${account.slug} trocado`,
  }).catch(() => {});
  return account;
}

/** Histórico de trocas de plano de uma account (mais recente primeiro). */
export async function listPlanChanges(accountId: string): Promise<PlanChangeRow[]> {
  const rows = await selectRows('plan_changes', {
    eq: { account_id: accountId },
    order: 'created_at.desc',
  });
  return parseRows(planChangeRowSchema, rows);
}
