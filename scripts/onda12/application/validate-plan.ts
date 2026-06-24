// Onda 12 — Plano de validação de uma conexão: traduz a HealthDecision num patch de
// ad_account_connections + se deve avisar o gestor (SPEC §5.4). Puro/determinístico; o relógio entra
// como argumento (nowIso) para os testes serem estáveis. A skill aplica o patch via REST.

import type { HealthDecision } from '../domain/connection-health.ts';

export interface ConnectionPatchPlan {
  patch: Record<string, unknown>; // o que gravar em ad_account_connections
  notify: boolean; // avisar o gestor (token revogado)
  message: string | null; // texto do aviso (sem segredo)
}

export function planConnectionPatch(
  decision: HealthDecision,
  metaAdAccountId: string,
  nowIso: string,
): ConnectionPatchPlan {
  switch (decision.kind) {
    case 'ok':
      return {
        patch: { status: 'active', last_validated_at: nowIso, last_validation_error: null },
        notify: false,
        message: null,
      };
    case 'auth_error':
      return {
        patch: {
          status: 'revoked',
          last_validated_at: nowIso,
          last_validation_error: decision.error,
        },
        notify: true,
        message: `Conexão Meta ${metaAdAccountId} parou de funcionar (token revogado/expirado). Reconecte para retomar as campanhas.`,
      };
    case 'transient':
      // Não condena o token: registra o erro, mantém o status atual, não avisa.
      return {
        patch: { last_validation_error: decision.error },
        notify: false,
        message: null,
      };
  }
}
