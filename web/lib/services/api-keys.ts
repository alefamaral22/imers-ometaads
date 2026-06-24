import 'server-only';
import { selectRows, insertRows, patchRows } from '../db/client';
import {
  apiKeyDisplaySchema,
  parseRows,
  API_KEY_DISPLAY_COLUMNS,
  type ApiKeyDisplay,
} from '../domain/schemas';
import { scopeEq, canManageAccount, type AccountScope } from '../multitenant/scope';
import { sealSecret } from '../multitenant/secrets';
import { apiKeyEncKey } from '../multitenant/enc-keys';

/**
 * Server-side de api_keys_clientes. LEITURA projeta só colunas de DISPLAY (key_cipher NUNCA sai do
 * servidor). ESCRITA cifra a chave (AES-256-GCM) antes de gravar e guarda só os últimos 4 chars.
 * unique(account_id, provider): salvar de novo o mesmo provedor ATUALIZA (rotação), não duplica.
 */
export async function listApiKeys(scope: AccountScope): Promise<ApiKeyDisplay[]> {
  const eq = scopeEq(scope);
  const rows = await selectRows('api_keys_clientes', {
    select: API_KEY_DISPLAY_COLUMNS,
    order: 'provider.asc',
    ...(eq ? { eq } : {}),
  });
  return parseRows(apiKeyDisplaySchema, rows);
}

export interface UpsertApiKeyInput {
  accountId: string;
  provider: 'anthropic' | 'openai' | 'elevenlabs' | 'minimax' | 'other';
  key: string; // texto puro (só aqui; cifrado antes de gravar)
  label?: string | undefined;
}

/** Cria ou rotaciona a chave de um provedor: cifra, grava ciphertext + last4, status 'unverified'. */
export async function upsertApiKey(
  scope: AccountScope,
  input: UpsertApiKeyInput,
): Promise<ApiKeyDisplay> {
  if (!canManageAccount(scope, input.accountId)) {
    throw new Error('forbidden: cannot manage this account');
  }
  const sealed = sealSecret(input.key, apiKeyEncKey());
  const fields = {
    key_cipher: sealed.cipherHex,
    key_last4: sealed.last4,
    label: input.label ?? null,
    status: 'unverified',
    key_version: 1,
  };

  // Rotação: se já existe chave para (account, provider), atualiza; senão insere.
  const existing = await selectRows('api_keys_clientes', {
    select: 'id',
    eq: { account_id: input.accountId, provider: input.provider },
    limit: 1,
  });
  const existingId = (existing[0] as { id?: string } | undefined)?.id;

  const rows = existingId
    ? await patchRows('api_keys_clientes', { id: existingId }, fields)
    : await insertRows('api_keys_clientes', [
        { account_id: input.accountId, provider: input.provider, ...fields },
      ]);

  const parsed = parseRows(apiKeyDisplaySchema, rows);
  const first = parsed[0];
  if (!first) throw new Error('upsert api_keys_clientes returned no row');
  return first;
}
