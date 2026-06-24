import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverEnv } from '../env';
import {
  SESSION_COOKIE_NAME,
  isAuthenticated,
  hasRole,
  type AccountRole,
  type SessionClaims,
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
