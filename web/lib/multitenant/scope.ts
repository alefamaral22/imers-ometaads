// Onda 12 — Isolamento de tenant no dashboard (Opção A, ADR 0026). A leitura é server-side via
// service_role (que ignora RLS), então o isolamento é garantido AQUI: TODA query de tenant passa por
// este escopo. super_admin (a agência) vê tudo; demais ficam restritos à própria account. Puro/testável.

export type Role = 'super_admin' | 'socio' | 'cliente_usuario';

export interface AccountScope {
  role: Role;
  accountId: string; // a account "corrente" (dona dos recursos criados)
}

// Onda 13 — papéis com visibilidade global (a agência e seus sócios). cliente_usuario fica restrito.
// FRONTEIRA DE SEGURANÇA: incluir um papel aqui = ele passa a ver dados de TODOS os tenants.
const GLOBAL_VISIBILITY: ReadonlySet<Role> = new Set<Role>(['super_admin', 'socio']);

/** Monta o escopo a partir das claims da sessão (ADR 0029). */
export function scopeFromClaims(claims: { sub: string; role: Role }): AccountScope {
  return { role: claims.role, accountId: claims.sub };
}

/**
 * Filtro de igualdade a aplicar nas leituras de tenant. Papéis de visibilidade global → null (sem
 * restrição, veem tudo); cliente_usuario → restrito a `account_id = <accountId>`. Um `null` aqui NUNCA
 * pode escapar para um cliente_usuario — por isso a decisão vive num só lugar, coberto por teste.
 */
export function scopeEq(scope: AccountScope): Record<string, string> | null {
  if (GLOBAL_VISIBILITY.has(scope.role)) return null;
  return { account_id: scope.accountId };
}

/** Pode o portador do escopo gerir recursos desta account? Visibilidade global sim; demais só a sua. */
export function canManageAccount(scope: AccountScope, targetAccountId: string): boolean {
  if (GLOBAL_VISIBILITY.has(scope.role)) return true;
  return scope.accountId === targetAccountId;
}
