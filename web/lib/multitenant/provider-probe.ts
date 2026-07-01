import 'server-only';
import type { KeyProbeResult } from './provider-health';

// Onda 12 — Probe de auth por provedor: um GET barato que só autentica (não gasta tokens/crédito
// relevante) para saber se a chave é válida. A chave nunca é logada. Falha de rede → httpStatus 0
// (transitório: não condena a chave). Só provedores em PROBEABLE_PROVIDERS chegam aqui.

async function probe(url: string, headers: Record<string, string>): Promise<KeyProbeResult> {
  try {
    const res = await fetch(url, { method: 'GET', headers });
    return { ok: res.ok, httpStatus: res.status };
  } catch {
    return { ok: false, httpStatus: 0 };
  }
}

export async function probeApiKey(
  provider: 'anthropic' | 'openai' | 'elevenlabs',
  key: string,
): Promise<KeyProbeResult> {
  if (provider === 'anthropic') {
    return probe('https://api.anthropic.com/v1/models', {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    });
  }
  if (provider === 'openai') {
    return probe('https://api.openai.com/v1/models', { authorization: `Bearer ${key}` });
  }
  return probe('https://api.elevenlabs.io/v1/user', { 'xi-api-key': key });
}
