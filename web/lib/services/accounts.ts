import 'server-only';
import { selectRows } from '../db/client';
import { accountRowSchema, parseRows, type AccountRow } from '../domain/schemas';
import type { AccountScope } from '../multitenant/scope';

/**
 * Server-side reads of public.accounts (RLS closed to the browser, ADR 0002/0026). No row carries a
 * secret. The dashboard operator is the agency super_admin; the anchor account ('acme') is the
 * "current" account used when creating tenant-owned resources.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  const rows = await selectRows('accounts', { order: 'created_at.asc' });
  return parseRows(accountRowSchema, rows);
}

/** The agency super_admin account. The single-operator session maps to this scope (MVP). */
export async function getCurrentScope(): Promise<AccountScope> {
  const rows = await selectRows('accounts', { eq: { role: 'super_admin' }, limit: 1 });
  const parsed = parseRows(accountRowSchema, rows);
  const anchor = parsed[0];
  if (!anchor) throw new Error('no super_admin account found (run the multi-tenant migration)');
  return { role: 'super_admin', accountId: anchor.id };
}
