// Onda 12 — Classificação da saúde de uma chave de provedor (espelha classifyMetaProbe do runner).
// Pura: recebe o status HTTP de um probe de auth ao provedor e decide se a chave está OK, é inválida,
// ou se o erro é transitório (não condena uma chave possivelmente boa). Caller mapeia em api_key_status.

export type KeyStatus = 'unverified' | 'active' | 'invalid';

// Provedores com endpoint de auth barato para validar (GET que exige a chave). minimax/other não têm
// probe simples → ficam 'unverified' (honesto: não conseguimos afirmar que funciona).
export const PROBEABLE_PROVIDERS = new Set(['anthropic', 'openai', 'elevenlabs']);

/** Resultado bruto do probe de auth (sem a chave embutida). httpStatus 0 = falha de rede. */
export interface KeyProbeResult {
  ok: boolean; // 2xx: a chave autenticou
  httpStatus: number;
}

export type KeyHealthDecision =
  | { kind: 'ok' } // → active
  | { kind: 'auth_error' } // → invalid (chave errada/revogada)
  | { kind: 'transient' }; // → mantém unverified (rate limit/5xx/rede)

export function classifyKeyProbe(probe: KeyProbeResult): KeyHealthDecision {
  if (probe.ok) return { kind: 'ok' };
  if (probe.httpStatus === 401 || probe.httpStatus === 403) return { kind: 'auth_error' };
  return { kind: 'transient' };
}

export function statusFromDecision(decision: KeyHealthDecision): KeyStatus {
  if (decision.kind === 'ok') return 'active';
  if (decision.kind === 'auth_error') return 'invalid';
  return 'unverified';
}
