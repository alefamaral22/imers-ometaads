import { describe, it, expect } from 'vitest';
import { scopeEq, canManageAccount, type AccountScope } from './scope';

const ACME = 'acme-account-id';
const OTHER = 'other-account-id';

const superAdmin: AccountScope = { role: 'super_admin', accountId: ACME };
const tenant: AccountScope = { role: 'cliente_usuario', accountId: ACME };

describe('scopeEq', () => {
  it('super_admin gets no restriction (sees all)', () => {
    expect(scopeEq(superAdmin)).toBeNull();
  });

  it('a tenant is restricted to its own account_id', () => {
    expect(scopeEq(tenant)).toEqual({ account_id: ACME });
    expect(scopeEq({ role: 'socio', accountId: ACME })).toEqual({ account_id: ACME });
  });
});

describe('canManageAccount', () => {
  it('super_admin can manage any account', () => {
    expect(canManageAccount(superAdmin, OTHER)).toBe(true);
  });

  it('a tenant can manage only its own account', () => {
    expect(canManageAccount(tenant, ACME)).toBe(true);
    expect(canManageAccount(tenant, OTHER)).toBe(false);
  });
});
