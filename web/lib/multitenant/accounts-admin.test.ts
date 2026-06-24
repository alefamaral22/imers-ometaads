import { describe, it, expect } from 'vitest';
import {
  PROVISIONABLE_ROLES,
  buildAccountInsertRow,
  canToggleAccount,
  type NewAccountInput,
} from './accounts-admin';

const INPUT: NewAccountInput = {
  slug: 'cliente-x',
  name: 'Cliente X',
  role: 'cliente_usuario',
  plan: 'trial',
  email: 'dono@cliente-x.com',
};

describe('PROVISIONABLE_ROLES', () => {
  it('nunca permite criar super_admin pela UI (anti-escalada)', () => {
    expect(PROVISIONABLE_ROLES).toEqual(['socio', 'cliente_usuario']);
    expect((PROVISIONABLE_ROLES as readonly string[]).includes('super_admin')).toBe(false);
  });
});

describe('buildAccountInsertRow', () => {
  it('monta a linha com o hash dado; conta nasce ativa e em trial; sem texto puro', () => {
    const row = buildAccountInsertRow(INPUT, 'scrypt$aa$bb');
    expect(row).toEqual({
      slug: 'cliente-x',
      name: 'Cliente X',
      role: 'cliente_usuario',
      plan: 'trial',
      email: 'dono@cliente-x.com',
      password_hash: 'scrypt$aa$bb',
      subscription_status: 'trialing',
      is_active: true,
    });
  });

  it('é pura/determinística (mesma entrada → mesma linha)', () => {
    expect(buildAccountInsertRow(INPUT, 'h')).toEqual(buildAccountInsertRow(INPUT, 'h'));
  });
});

describe('canToggleAccount', () => {
  const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('permite alternar uma account de cliente que não é a minha', () => {
    expect(
      canToggleAccount(ME, { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role: 'cliente_usuario' }),
    ).toEqual({ ok: true });
  });

  it('proíbe desativar a própria account (anti-lockout)', () => {
    expect(canToggleAccount(ME, { id: ME, role: 'cliente_usuario' })).toEqual({
      ok: false,
      reason: 'self',
    });
  });

  it('proíbe alternar qualquer super_admin (protege a âncora)', () => {
    expect(
      canToggleAccount(ME, { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', role: 'super_admin' }),
    ).toEqual({ ok: false, reason: 'super_admin' });
  });
});
