import { describe, it, expect } from 'vitest';
import { planTenantKeyEnv } from './tenant-key-env.ts';

describe('planTenantKeyEnv', () => {
  it('injects tenant keys the account configured, leaves others on global', () => {
    const r = planTenantKeyEnv({
      role: 'cliente_usuario',
      tenantKeys: [
        { provider: 'anthropic', status: 'active' },
        { provider: 'openai', status: 'active' },
      ],
      globalProviders: {},
      providers: ['anthropic', 'openai'],
    });
    expect(r).toEqual({ ok: true, useTenant: ['anthropic', 'openai'] });
  });

  it('aborts when a non-super_admin lacks a required key', () => {
    const r = planTenantKeyEnv({
      role: 'cliente_usuario',
      tenantKeys: [{ provider: 'anthropic', status: 'active' }],
      globalProviders: { openai: true },
      providers: ['anthropic', 'openai'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.provider).toBe('openai');
  });

  it('super_admin falls back to global (no tenant injection, no abort)', () => {
    const r = planTenantKeyEnv({
      role: 'super_admin',
      tenantKeys: [],
      globalProviders: { anthropic: true, openai: true },
      providers: ['anthropic', 'openai'],
    });
    expect(r).toEqual({ ok: true, useTenant: [] });
  });

  it('aborts on the first invalid tenant key for a non-super_admin', () => {
    const r = planTenantKeyEnv({
      role: 'socio',
      tenantKeys: [{ provider: 'anthropic', status: 'invalid' }],
      globalProviders: {},
      providers: ['anthropic'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('inválida');
  });
});
