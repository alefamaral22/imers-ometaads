import 'server-only';
import { serverEnv } from '../env';
import { parseKey } from './secrets';

/**
 * Onda 12 — resolve as chaves de cripto (32 bytes) do env, server-side. Lança com mensagem clara se
 * faltarem (o cofre só aceita escrita com as duas configuradas). A chave nunca sai daqui.
 */
export function adTokenEncKey(): Buffer {
  const material = serverEnv().AD_TOKEN_ENC_KEY;
  if (!material)
    throw new Error('AD_TOKEN_ENC_KEY não configurada — não é possível cifrar o token');
  return parseKey(material);
}

export function apiKeyEncKey(): Buffer {
  const material = serverEnv().API_KEY_ENC_KEY;
  if (!material) throw new Error('API_KEY_ENC_KEY não configurada — não é possível cifrar a chave');
  return parseKey(material);
}
