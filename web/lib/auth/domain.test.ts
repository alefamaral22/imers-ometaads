import { describe, it, expect } from 'vitest';
import {
  buildClaims,
  isAuthenticated,
  hasRole,
  loginInputSchema,
  sessionClaimsSchema,
  passwordMatches,
  impersonationClaimsSchema,
} from './domain';

const ACCOUNT = {
  id: '11111111-1111-1111-1111-111111111111',
  role: 'cliente_usuario' as const,
  slug: 'acme',
};

describe('buildClaims / sessionClaimsSchema', () => {
  it('builds claims from an account and they validate', () => {
    const claims = buildClaims(ACCOUNT);
    expect(claims).toEqual({ sub: ACCOUNT.id, role: 'cliente_usuario', slug: 'acme' });
    expect(sessionClaimsSchema.safeParse(claims).success).toBe(true);
  });

  it('rejects a non-uuid sub or unknown role', () => {
    expect(
      sessionClaimsSchema.safeParse({ sub: 'x', role: 'cliente_usuario', slug: 'a' }).success,
    ).toBe(false);
    expect(
      sessionClaimsSchema.safeParse({ sub: ACCOUNT.id, role: 'root', slug: 'a' }).success,
    ).toBe(false);
  });
});

describe('isAuthenticated / hasRole', () => {
  it('isAuthenticated is true for any claims, false for null', () => {
    expect(isAuthenticated(buildClaims(ACCOUNT))).toBe(true);
    expect(isAuthenticated(null)).toBe(false);
  });

  it('hasRole gates by role', () => {
    const sa = buildClaims({ ...ACCOUNT, role: 'super_admin' });
    expect(hasRole(sa, ['super_admin'])).toBe(true);
    expect(hasRole(buildClaims(ACCOUNT), ['super_admin'])).toBe(false);
    expect(hasRole(null, ['super_admin'])).toBe(false);
  });
});

describe('loginInputSchema', () => {
  it('requires a valid email and a password', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(loginInputSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('passwordMatches (legacy bootstrap)', () => {
  it('is timing-safe and case-insensitive on hex digests', () => {
    expect(passwordMatches('ABCD', 'abcd')).toBe(true);
    expect(passwordMatches('abcd', 'abce')).toBe(false);
  });
});

describe('impersonationClaimsSchema', () => {
  it('accepts a well-formed impersonation payload', () => {
    const payload = {
      actorAccountId: '11111111-1111-1111-1111-111111111111',
      targetAccountId: '22222222-2222-2222-2222-222222222222',
      targetSlug: 'cliente-x',
    };
    expect(impersonationClaimsSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a forged/malformed payload (non-uuid ids)', () => {
    expect(
      impersonationClaimsSchema.safeParse({
        actorAccountId: 'not-a-uuid',
        targetAccountId: '22222222-2222-2222-2222-222222222222',
        targetSlug: 'cliente-x',
      }).success,
    ).toBe(false);
  });
});
