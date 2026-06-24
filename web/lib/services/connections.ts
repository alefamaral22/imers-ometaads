import 'server-only';
import { selectRows, insertRows } from '../db/client';
import {
  connectionDisplaySchema,
  parseRows,
  CONNECTION_DISPLAY_COLUMNS,
  type ConnectionDisplay,
} from '../domain/schemas';
import { scopeEq, canManageAccount, type AccountScope } from '../multitenant/scope';
import { sealSecret } from '../multitenant/secrets';
import { adTokenEncKey } from '../multitenant/enc-keys';

/**
 * Server-side de ad_account_connections. LEITURA projeta só colunas de DISPLAY (o cipher do token
 * NUNCA é selecionado → nunca sai do servidor). ESCRITA cifra o token (AES-256-GCM) antes de gravar e
 * guarda só os últimos 4 chars. Isolamento por escopo de account (ADR 0026/0027).
 */
export async function listConnections(scope: AccountScope): Promise<ConnectionDisplay[]> {
  const eq = scopeEq(scope); // super_admin → null (sem filtro, vê todas)
  const rows = await selectRows('ad_account_connections', {
    select: CONNECTION_DISPLAY_COLUMNS,
    order: 'created_at.desc',
    ...(eq ? { eq } : {}),
  });
  return parseRows(connectionDisplaySchema, rows);
}

export interface CreateConnectionInput {
  accountId: string;
  metaAdAccountId: string;
  token: string; // System User token em texto puro (só aqui; cifrado antes de gravar)
  tokenLabel?: string | undefined;
  clientId?: string | undefined;
}

/** Cria uma conexão manual: cifra o token, grava só ciphertext + last4, status 'unverified'. */
export async function createConnection(
  scope: AccountScope,
  input: CreateConnectionInput,
): Promise<ConnectionDisplay> {
  if (!canManageAccount(scope, input.accountId)) {
    throw new Error('forbidden: cannot manage this account');
  }
  const sealed = sealSecret(input.token, adTokenEncKey());
  const row = {
    account_id: input.accountId,
    client_id: input.clientId ?? null,
    meta_ad_account_id: input.metaAdAccountId,
    connection_method: 'manual_token',
    access_token_cipher: sealed.cipherHex,
    access_token_last4: sealed.last4,
    token_label: input.tokenLabel ?? null,
    status: 'unverified',
  };
  const inserted = await insertRows('ad_account_connections', [row]);
  // O parse pela projeção de DISPLAY remove o cipher da representação — nunca volta ao caller.
  const parsed = parseRows(connectionDisplaySchema, inserted);
  const first = parsed[0];
  if (!first) throw new Error('insert ad_account_connections returned no row');
  return first;
}
