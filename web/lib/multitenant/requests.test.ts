import { describe, it, expect } from 'vitest';
import {
  createConnectionSchema,
  upsertApiKeySchema,
  createAccountSchema,
  setAccountActiveSchema,
} from './requests';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('createConnectionSchema', () => {
  it('accepts a valid connection', () => {
    const r = createConnectionSchema.safeParse({
      accountId: UUID,
      metaAdAccountId: 'act_1234567890',
      token: 'EAAB'.padEnd(40, 'x'),
    });
    expect(r.success).toBe(true);
  });

  it('rejects a bad ad account id and a short token', () => {
    expect(
      createConnectionSchema.safeParse({
        accountId: UUID,
        metaAdAccountId: 'nope',
        token: 'x'.repeat(40),
      }).success,
    ).toBe(false);
    expect(
      createConnectionSchema.safeParse({ accountId: UUID, metaAdAccountId: '123', token: 'short' })
        .success,
    ).toBe(false);
  });
});

describe('upsertApiKeySchema', () => {
  it('accepts a known provider with a key', () => {
    const r = upsertApiKeySchema.safeParse({
      accountId: UUID,
      provider: 'openai',
      key: 'sk-'.padEnd(20, 'a'),
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown provider', () => {
    expect(
      upsertApiKeySchema.safeParse({ accountId: UUID, provider: 'cohere', key: 'x'.repeat(20) })
        .success,
    ).toBe(false);
  });
});

describe('createAccountSchema', () => {
  const base = {
    slug: 'cliente-x',
    name: 'Cliente X',
    role: 'cliente_usuario',
    email: 'dono@cliente-x.com',
    password: 'segredo-forte',
  };

  it('aceita uma conta válida e aplica o plano padrão trial', () => {
    const r = createAccountSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.plan).toBe('trial');
  });

  it('NUNCA aceita role super_admin (anti-escalada pela UI)', () => {
    expect(createAccountSchema.safeParse({ ...base, role: 'super_admin' }).success).toBe(false);
  });

  it('rejeita slug com maiúsculas/símbolos e senha curta', () => {
    expect(createAccountSchema.safeParse({ ...base, slug: 'Cliente_X' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...base, password: 'curta' }).success).toBe(false);
  });
});

describe('setAccountActiveSchema', () => {
  it('exige um booleano isActive', () => {
    expect(setAccountActiveSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(setAccountActiveSchema.safeParse({ isActive: 'no' }).success).toBe(false);
  });
});
