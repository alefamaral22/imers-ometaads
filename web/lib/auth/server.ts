import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverEnv } from '../env';
import { SESSION_COOKIE_NAME, isAuthorizedOperator, type SessionClaims } from './domain';
import { verifySession } from './session';

/**
 * Server-side session guard used by protected pages and API routes. Order is
 * auth (verify cookie) -> authz (operator role). Pages call requireOperator(); it redirects to
 * /login when there is no valid session.
 */

export async function readSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token, serverEnv().AUTH_SECRET);
}

export async function requireOperator(): Promise<SessionClaims> {
  const claims = await readSession();
  if (!isAuthorizedOperator(claims)) {
    redirect('/login');
  }
  return claims;
}
