import { describe, it, expect } from 'vitest';
import { resolveProviderKey, type AccountRole, type ApiKeyStatus } from './provider-key.ts';

function resolve(
  role: AccountRole,
  tenantStatus: ApiKeyStatus | null,
  globalKeyAvailable: boolean,
) {
  return resolveProviderKey({
    role,
    provider: 'openai',
    tenantKey: tenantStatus === null ? null : { status: tenantStatus },
    globalKeyAvailable,
  });
}

describe('resolveProviderKey — tenant has a usable key', () => {
  it('uses the tenant key (active) for any role, never the global', () => {
    expect(resolve('cliente_usuario', 'active', true)).toEqual({ source: 'tenant' });
    expect(resolve('socio', 'active', true)).toEqual({ source: 'tenant' });
    expect(resolve('super_admin', 'active', true)).toEqual({ source: 'tenant' });
  });

  it('treats an unverified key as usable (status ≠ invalid)', () => {
    expect(resolve('cliente_usuario', 'unverified', false)).toEqual({ source: 'tenant' });
  });
});

describe('resolveProviderKey — no own key', () => {
  it('super_admin falls back to the global key when present', () => {
    expect(resolve('super_admin', null, true)).toEqual({ source: 'global' });
  });

  it('super_admin aborts when there is no global key either', () => {
    const r = resolve('super_admin', null, false);
    expect(r.source).toBe('abort');
  });

  it('non-super_admin always aborts (own key required)', () => {
    expect(resolve('cliente_usuario', null, true).source).toBe('abort');
    expect(resolve('socio', null, true).source).toBe('abort');
  });
});

describe('resolveProviderKey — own key is invalid', () => {
  it('super_admin may fall back to the global key', () => {
    expect(resolve('super_admin', 'invalid', true)).toEqual({ source: 'global' });
  });

  it('non-super_admin aborts asking to reconfigure', () => {
    const r = resolve('cliente_usuario', 'invalid', true);
    expect(r.source).toBe('abort');
    if (r.source === 'abort') expect(r.reason).toContain('inválida');
  });
});
