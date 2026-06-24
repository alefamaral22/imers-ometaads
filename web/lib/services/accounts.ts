import 'server-only';
import { selectRows, patchRows } from '../db/client';
import { accountRowSchema, parseRows, type AccountRow } from '../domain/schemas';
import { readSession } from '../auth/server';
import { scopeFromClaims, type AccountScope } from '../multitenant/scope';
import type { AccountRole } from '../auth/domain';

/**
 * Server-side reads of public.accounts (RLS closed to the browser, ADR 0002/0026). The account list
 * never carries a secret; the login query (below) reads password_hash but it stays server-side.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  const rows = await selectRows('accounts', { order: 'created_at.asc' });
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
