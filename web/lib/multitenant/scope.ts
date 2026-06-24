// Onda 12 — Isolamento de tenant no dashboard (Opção A, ADR 0026). A leitura é server-side via
// service_role (que ignora RLS), então o isolamento é garantido AQUI: TODA query de tenant passa por
// este escopo. super_admin (a agência) vê tudo; demais ficam restritos à própria account. Puro/testável.

export type Role = 'super_admin' | 'socio' | 'cliente_usuario';

export interface AccountScope {
  role: Role;
  accountId: string; // a account "corrente" (dona dos recursos criados)
}

/**
 * Filtro de igualdade a aplicar nas leituras de tenant. super_admin → null (sem restrição, vê tudo);
 * qualquer outro role → restrito a `account_id = <accountId>`. Um `null` aqui NUNCA pode escapar para
 * um role não-super_admin — por isso a decisão vive num só lugar, coberto por teste.
 */
export function scopeEq(scope: AccountScope): Record<string, string> | null {
  if (scope.role === 'super_admin') return null;
  return { account_id: scope.accountId };
}

/** Pode o portador do escopo gerir recursos desta account? super_admin sim (qualquer); demais só a sua. */
export function canManageAccount(scope: AccountScope, targetAccountId: string): boolean {
  if (scope.role === 'super_admin') return true;
  return scope.accountId === targetAccountId;
}
