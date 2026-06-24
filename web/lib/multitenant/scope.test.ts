import { describe, it, expect } from 'vitest';
import { scopeEq, canManageAccount, scopeFromClaims, type AccountScope } from './scope';

const ACME = 'acme-account-id';
const OTHER = 'other-account-id';

const superAdmin: AccountScope = { role: 'super_admin', accountId: ACME };
const socio: AccountScope = { role: 'socio', accountId: ACME };
const tenant: AccountScope = { role: 'cliente_usuario', accountId: ACME };

describe('scopeEq', () => {
  it('super_admin and socio get no restriction (see all — global visibility)', () => {
    expect(scopeEq(superAdmin)).toBeNull();
    expect(scopeEq(socio)).toBeNull();
  });

  it('cliente_usuario is restricted to its own account_id', () => {
    expect(scopeEq(tenant)).toEqual({ account_id: ACME });
  });
});

describe('canManageAccount', () => {
  it('global-visibility roles can manage any account', () => {
    expect(canManageAccount(superAdmin, OTHER)).toBe(true);
    expect(canManageAccount(socio, OTHER)).toBe(true);
  });

  it('cliente_usuario can manage only its own account', () => {
    expect(canManageAccount(tenant, ACME)).toBe(true);
    expect(canManageAccount(tenant, OTHER)).toBe(false);
  });
});

describe('scopeFromClaims', () => {
  it('maps session claims (sub→accountId, role)', () => {
    expect(scopeFromClaims({ sub: ACME, role: 'cliente_usuario' })).toEqual({
      role: 'cliente_usuario',
      accountId: ACME,
    });
  });
});
