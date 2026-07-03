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

// Onda 15 — escopo de visibilidade global (a agência). Usado por superfícies JÁ restritas a
// super_admin/socio (ex.: Nexus), onde as leituras são intencionalmente de toda a agência. O accountId
// é irrelevante aqui: scopeEq curto-circuita em null para papéis globais.
export const AGENCY_SCOPE: AccountScope = { role: 'super_admin', accountId: '' };

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

/** A agência (super_admin/socio) tem visibilidade global — não é limitada por plano de tenant. */
export function hasGlobalVisibility(scope: AccountScope): boolean {
  return GLOBAL_VISIBILITY.has(scope.role);
}

// Onda 15 — tabelas "filhas" (campaigns/analyses/landing_pages/operation_logs) não têm account_id;
// pertencem a um client_id, e cada cliente pertence a uma account. O escopo delas vem dos client_ids
// da account. Esta decisão é pura/testável; o I/O (resolver os ids) fica no serviço.
export type ClientScopeFilter =
  | { kind: 'all' } // visibilidade global (super_admin/socio): sem filtro
  | { kind: 'none' } // restrito e a account não tem clientes: resultado vazio, sem ir ao banco
  | { kind: 'in'; clientIds: readonly string[] }; // restrito: filtra por client_id IN (...)

/**
 * A partir dos client_ids da account (ou null = global), decide como escopar uma tabela filha.
 * `null` → 'all'; `[]` → 'none' (curto-circuito anti-vazamento: nunca vira "sem filtro"); senão 'in'.
 */
export function clientScopeFilter(clientIds: readonly string[] | null): ClientScopeFilter {
  if (clientIds === null) return { kind: 'all' };
  if (clientIds.length === 0) return { kind: 'none' };
  return { kind: 'in', clientIds };
}
