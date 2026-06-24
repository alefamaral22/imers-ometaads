// Onda 12 — Classificação da saúde de uma conexão Meta (ADR 0027/0028, SPEC §5.4).
// Pura: recebe o resultado de um probe à Graph API e decide se o token está OK, foi revogado, ou se
// o erro é transitório (não mexe no status). System User token não expira sozinho, mas pode ser
// REVOGADO do lado do cliente → erro de auth = revoked. Caller (skill) mapeia a decisão em patch.

export type ConnectionStatus = 'unverified' | 'active' | 'invalid' | 'revoked';

/** Resultado bruto de um GET act_<id>?fields=name à Meta (sem segredo embutido). */
export interface MetaProbeResult {
  ok: boolean; // a chamada autenticou e respondeu 2xx
  httpStatus: number;
  errorCode?: number | null; // error.code da Graph API quando !ok
  errorMessage?: string | null;
}

/**
 * Decisão da saúde:
 *  - `ok`        → token funciona; vira `active` + last_validated_at.
 *  - `auth_error`→ token revogado/expirado/sem permissão; vira `revoked` + avisa o gestor.
 *  - `transient` → erro passageiro (rate limit/5xx/rede); NÃO mexe no status, NÃO avisa (re-tenta depois).
 */
export type HealthDecision =
  | { kind: 'ok' }
  | { kind: 'auth_error'; error: string }
  | { kind: 'transient'; error: string };

// Códigos da Graph API que indicam token inválido/revogado/sem permissão (não transitório).
const META_AUTH_ERROR_CODES = new Set([102, 190, 200, 10, 294, 458, 459, 460, 463, 467]);

export function classifyMetaProbe(probe: MetaProbeResult): HealthDecision {
  if (probe.ok) return { kind: 'ok' };

  const code = probe.errorCode ?? null;
  const msg = probe.errorMessage ?? `meta probe failed (http ${probe.httpStatus})`;

  const isAuth =
    probe.httpStatus === 401 ||
    probe.httpStatus === 403 ||
    (code !== null && META_AUTH_ERROR_CODES.has(code));

  if (isAuth) return { kind: 'auth_error', error: msg };

  // 429 e 5xx (ou qualquer outro) = transitório: não condena um token possivelmente saudável.
  return { kind: 'transient', error: msg };
}
