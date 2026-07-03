import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverEnv } from '../env';
import {
  SESSION_COOKIE_NAME,
  IMPERSONATION_COOKIE_NAME,
  isAuthenticated,
  hasRole,
  impersonationClaimsSchema,
  type AccountRole,
  type SessionClaims,
  type ImpersonationClaims,
} from './domain';
import { verifySession } from './session';

/**
 * Server-side session guard used by protected pages and API routes. Order is
 * auth (verify cookie) -> authz (role). Pages call requireOperator() to require any authenticated
 * account session; requireRole() gates platform-admin actions. Redirects when there is no session.
 */

export async function readSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token, serverEnv().AUTH_SECRET);
}

/** Require any authenticated account session (redirects to /login otherwise). */
export async function requireOperator(): Promise<SessionClaims> {
  const claims = await readSession();
  if (!isAuthenticated(claims)) {
    redirect('/login');
  }
  return claims;
}

/** Require one of the given roles (e.g. ['super_admin'] for platform ops). Redirects otherwise. */
export async function requireRole(roles: readonly AccountRole[]): Promise<SessionClaims> {
  const claims = await requireOperator();
  if (!hasRole(claims, roles)) {
    redirect('/');
  }
  return claims;
}

/**
 * Impersonação SOMENTE LEITURA (etapa "super-admin completo"). Lê o cookie separado; nunca é usado
 * para autorizar mutação — toda escrita continua checando requireRole/hasRole sobre a sessão REAL.
 * Cookie ausente/expirado/forjado → null (degrada para "sem impersonação", nunca quebra a página).
 */
export async function readImpersonation(): Promise<ImpersonationClaims | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = impersonationClaimsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Escopo de LEITURA efetivo: se há impersonação ativa E a sessão real é super_admin, lê como o
 * cliente impersonado (accountId do target, role cliente_usuario — a visão mais restrita, nunca
 * mais ampla). Sem impersonação (ou sessão real não é super_admin), usa a própria sessão.
 */
export async function readEffectiveScope(): Promise<{
  claims: SessionClaims;
  impersonating: ImpersonationClaims | null;
}> {
  const claims = await requireOperator();
  if (!hasRole(claims, ['super_admin'])) return { claims, impersonating: null };
  const impersonating = await readImpersonation();
  return { claims, impersonating };
}
