import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, isAuthenticated } from './lib/auth/domain';
import { verifySession } from './lib/auth/session';
import { buildSecurityHeaders, generateNonce } from './lib/security/headers';

/**
 * Edge middleware: (1) applies the full security header set with a per-request CSP nonce to
 * EVERY response (SPEC-000 §11); (2) gates protected routes behind a valid operator session.
 * Order on a protected route: auth (verify cookie) -> authz (role) -> let the route do the rest.
 *
 * AUTH_SECRET is read from process.env directly (the env parser pulls in `zod` which is heavier
 * than the Edge runtime needs here; the value is still validated everywhere it is signed).
 */

// Paths reachable without a session. Everything else under matcher requires auth.
// `/api/health` is a public liveness probe (NO-PII, no data) hit by the Vercel cron (Onda 11).
const PUBLIC_PATHS = new Set(['/login', '/api/health']);
const PUBLIC_PREFIXES = ['/api/auth/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  // Em desenvolvimento o CSP é relaxado (eval/ws do HMR do Next); em produção é estrito (nonce).
  const headers = buildSecurityHeaders(nonce, process.env.NODE_ENV !== 'production');
  const { pathname } = request.nextUrl;

  // Forward the nonce to Server Components via request headers so they can tag inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // O Next.js lê o nonce a partir do header `Content-Security-Policy` da REQUISIÇÃO para injetá-lo
  // nos próprios <script> dele. Sem isto, com `strict-dynamic` (produção), os scripts do Next ficam
  // sem nonce → o browser os bloqueia → a página não hidrata (o botão de login nunca habilita).
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy'] ?? '');

  const authSecret = process.env.AUTH_SECRET ?? '';
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = await verifySession(token, authSecret);
  const authed = isAuthenticated(claims);

  let response: NextResponse;

  if (!authed && !isPublicPath(pathname)) {
    // auth failed -> bounce to login, preserving the intended destination.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    response = NextResponse.redirect(loginUrl);
  } else if (authed && pathname === '/login') {
    // Already authenticated: skip the login page.
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    response = NextResponse.redirect(homeUrl);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // Apply to all routes except Next internals and static assets (those still get headers via
  // next.config where relevant). Keeps the nonce/CSP on every HTML/route response.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
