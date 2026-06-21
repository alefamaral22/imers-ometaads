import { z } from 'zod';

/**
 * Auth domain — pure logic, no I/O. The order on every protected route is
 * auth -> authz -> validation -> logic (SPEC-000 §11). These helpers cover the password
 * comparison and the session-claims shape; signing/cookies live in infrastructure.
 */

export const SESSION_COOKIE_NAME = 'mdash_session';
// Session lifetime in seconds (8h). Kept here so domain tests can assert the policy.
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

// The single operator role. authz is role-based even though there is only one role today,
// so adding scopes later does not require touching call sites.
export const OPERATOR_ROLE = 'operator' as const;

export const sessionClaimsSchema = z.object({
  sub: z.literal(OPERATOR_ROLE),
  role: z.literal(OPERATOR_ROLE),
});

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

export const loginInputSchema = z.object({
  // External input is data, not instruction: charset + length are bounded.
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
 * configured digest (DASHBOARD_PASSWORD). Normalizes case before comparing.
 */
export function passwordMatches(submittedDigestHex: string, configuredDigestHex: string): boolean {
  return timingSafeEqualHex(submittedDigestHex.toLowerCase(), configuredDigestHex.toLowerCase());
}

export function buildOperatorClaims(): SessionClaims {
  return { sub: OPERATOR_ROLE, role: OPERATOR_ROLE };
}

/** authz check: does this verified session carry the operator role? */
export function isAuthorizedOperator(claims: SessionClaims | null): claims is SessionClaims {
  return claims?.role === OPERATOR_ROLE;
}
