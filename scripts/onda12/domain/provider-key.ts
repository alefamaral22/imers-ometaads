// Onda 12 — Resolução de qual chave de provedor usar por job (ADR 0027, SPEC §5.2).
// Regra inviolável: se o tenant tem chave própria utilizável, usa a dele e NUNCA a global do .env.
// Fora do super_admin, chave própria é obrigatória — sem ela, o job aborta (isolamento de custo).
// Lógica pura: decide a FONTE; o caller (infra) decifra/injeta. Nunca toca o segredo aqui.

export type AccountRole = 'super_admin' | 'socio' | 'cliente_usuario';
export type ApiKeyStatus = 'unverified' | 'active' | 'invalid';

/** A linha de api_keys_clientes para (account, provider), reduzida ao que a decisão precisa. */
export interface TenantKeyRef {
  status: ApiKeyStatus;
}

export type KeyResolution =
  | { source: 'tenant' } // decifrar e usar a chave do tenant
  | { source: 'global' } // usar a chave global do .env (só super_admin)
  | { source: 'abort'; reason: string }; // recusar o job com motivo claro

export interface ResolveKeyInput {
  role: AccountRole;
  provider: string; // só para a mensagem de erro
  tenantKey: TenantKeyRef | null; // null = o tenant não configurou chave p/ esse provedor
  globalKeyAvailable: boolean; // o .env tem a chave global desse provedor?
}

/**
 * Decide a fonte da chave para um job:
 *  - tenant tem chave utilizável (status ≠ invalid) → usa a do tenant (nunca a global);
 *  - tenant tem chave inválida → super_admin pode cair na global; qualquer outro role aborta;
 *  - tenant não tem chave → super_admin usa a global (se houver); qualquer outro role aborta.
 */
export function resolveProviderKey(input: ResolveKeyInput): KeyResolution {
  const { role, provider, tenantKey, globalKeyAvailable } = input;
  const isAgency = role === 'super_admin';

  if (tenantKey !== null && tenantKey.status !== 'invalid') {
    return { source: 'tenant' };
  }

  if (tenantKey !== null) {
    // Existe, mas está inválida.
    if (isAgency && globalKeyAvailable) return { source: 'global' };
    return {
      source: 'abort',
      reason: `a chave de ${provider} está inválida — reconfigure-a para continuar`,
    };
  }

  // Sem chave própria.
  if (isAgency) {
    return globalKeyAvailable
      ? { source: 'global' }
      : { source: 'abort', reason: `nenhuma chave global de ${provider} configurada` };
  }
  return { source: 'abort', reason: `configure sua chave de ${provider} para continuar` };
}
