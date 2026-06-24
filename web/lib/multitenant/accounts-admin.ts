// Onda 14 — Provisionamento de accounts pelo super_admin. Lógica PURA (sem I/O), testável.
// Anti-escalada de privilégio: a UI nunca cria super_admin (só socio/cliente_usuario) e nunca desativa
// um super_admin nem a própria account. Ver ADR 0030 e o threat model provisionamento-accounts.md.
import type { AccountRole } from '../auth/domain';

// Papéis que o super_admin pode criar pela UI. super_admin fica DE FORA de propósito (mintar um
// super_admin continua sendo ato manual de banco) — incluir aqui = abrir escalada de privilégio.
export const PROVISIONABLE_ROLES = ['socio', 'cliente_usuario'] as const;
export type ProvisionableRole = (typeof PROVISIONABLE_ROLES)[number];

export interface NewAccountInput {
  slug: string;
  name: string;
  role: ProvisionableRole;
  plan: string;
  email: string;
}

/**
 * Monta a linha de insert da account. Recebe o hash JÁ calculado (a hashing tem salt aleatório → mora
 * no serviço), então esta função é pura/determinística e testável. Toda conta nasce ativa, em trial.
 */
export function buildAccountInsertRow(
  input: NewAccountInput,
  passwordHash: string,
): Record<string, unknown> {
  return {
    slug: input.slug,
    name: input.name,
    role: input.role,
    plan: input.plan,
    email: input.email,
    password_hash: passwordHash,
    subscription_status: 'trialing',
    is_active: true,
  };
}

export type ToggleDecision = { ok: true } | { ok: false; reason: 'self' | 'super_admin' };

/**
 * Pode o super_admin ligar/desligar esta account? NÃO para a própria (anti-lockout) nem para uma
 * super_admin (protege a âncora e impede jogos de privilégio). Fronteira de segurança — testada.
 */
export function canToggleAccount(
  actingAccountId: string,
  target: { id: string; role: AccountRole },
): ToggleDecision {
  if (target.id === actingAccountId) return { ok: false, reason: 'self' };
  if (target.role === 'super_admin') return { ok: false, reason: 'super_admin' };
  return { ok: true };
}
