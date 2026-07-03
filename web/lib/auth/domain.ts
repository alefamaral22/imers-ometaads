import { z } from 'zod';

/**
 * Auth domain — pure logic, no I/O. The order on every protected route is
 * auth -> authz -> validation -> logic (SPEC-000 §11). These helpers cover the password
 * comparison and the session-claims shape; signing/cookies live in infrastructure.
 */

export const SESSION_COOKIE_NAME = 'mdash_session';
// Session lifetime in seconds (8h). Kept here so domain tests can assert the policy.
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

// Onda 13 — papéis por account (ADR 0029). super_admin/socio veem tudo; cliente_usuario só a sua.
export const accountRoleSchema = z.enum(['super_admin', 'socio', 'cliente_usuario']);
export type AccountRole = z.infer<typeof accountRoleSchema>;

// A sessão carrega QUEM é o tenant: id da account + papel + slug (para exibir/URLs).
export const sessionClaimsSchema = z.object({
  sub: z.string().uuid(), // account id
  role: accountRoleSchema,
  slug: z.string().min(1),
});

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

// Etapa "super-admin completo" — impersonação SOMENTE LEITURA. Cookie separado, TTL curto: nunca
// usado para autorizar mutação (toda mutação continua checando a sessão REAL via requireRole/hasRole).
export const IMPERSONATION_COOKIE_NAME = 'mdash_impersonation';
export const IMPERSONATION_TTL_SECONDS = 30 * 60; // 30min — sessão de visualização, não de trabalho

export const impersonationClaimsSchema = z.object({
  actorAccountId: z.string().uuid(), // quem iniciou (o super_admin real)
  targetAccountId: z.string().uuid(), // conta sendo visualizada
  targetSlug: z.string().min(1),
});
export type ImpersonationClaims = z.infer<typeof impersonationClaimsSchema>;

export const loginInputSchema = z.object({
  // External input is data, not instruction: charset + length are bounded.
  email: z.string().email().max(256),
  password: z.string().min(1).max(256),
  turnstileToken: z.string().max(2048).optional(),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

/**
 * Constant-time comparison of two hex digests of equal length. Avoids leaking the password
 * through timing. Both inputs are expected to be lowercase SHA-256 hex (64 chars).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Compares a freshly computed SHA-256 hex digest of the submitted password against the
 * configured digest (DASHBOARD_PASSWORD). Used ONLY for the legacy super_admin bootstrap until the
 * anchor account gets a real (scrypt) password set. Normalizes case before comparing.
 */
export function passwordMatches(submittedDigestHex: string, configuredDigestHex: string): boolean {
  return timingSafeEqualHex(submittedDigestHex.toLowerCase(), configuredDigestHex.toLowerCase());
}

/** Builds the session claims from a resolved account. */
export function buildClaims(account: {
  id: string;
  role: AccountRole;
  slug: string;
}): SessionClaims {
  return { sub: account.id, role: account.role, slug: account.slug };
}

/** authz: is there a valid (authenticated) session? Any account role is authenticated. */
export function isAuthenticated(claims: SessionClaims | null): claims is SessionClaims {
  return claims !== null;
}

/** authz: does the session carry one of the required roles? (e.g. ['super_admin'] for platform ops). */
export function hasRole(claims: SessionClaims | null, roles: readonly AccountRole[]): boolean {
  return claims !== null && roles.includes(claims.role);
}
