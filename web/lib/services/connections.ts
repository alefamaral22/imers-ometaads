import 'server-only';
import { selectRows, insertRows, patchRows, deleteRows } from '../db/client';
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

async function getConnectionById(id: string): Promise<ConnectionDisplay | null> {
  const rows = await selectRows('ad_account_connections', {
    select: CONNECTION_DISPLAY_COLUMNS,
    eq: { id },
    limit: 1,
  });
  return parseRows(connectionDisplaySchema, rows)[0] ?? null;
}

export interface UpdateConnectionInput {
  metaAdAccountId?: string | undefined;
  token?: string | undefined; // se enviado, re-cifra e volta status para 'unverified'
  tokenLabel?: string | null | undefined;
}

/** Edita uma conexão existente. Trocar o token re-cifra e volta o status para 'unverified'. */
export async function updateConnection(
  scope: AccountScope,
  id: string,
  input: UpdateConnectionInput,
): Promise<ConnectionDisplay> {
  const existing = await getConnectionById(id);
  if (!existing) throw new Error('not_found');
  if (!canManageAccount(scope, existing.account_id)) {
    throw new Error('forbidden: cannot manage this account');
  }
  const patch: Record<string, unknown> = {};
  if (input.metaAdAccountId !== undefined) patch.meta_ad_account_id = input.metaAdAccountId;
  if (input.tokenLabel !== undefined) patch.token_label = input.tokenLabel;
  if (input.token !== undefined) {
    const sealed = sealSecret(input.token, adTokenEncKey());
    patch.access_token_cipher = sealed.cipherHex;
    patch.access_token_last4 = sealed.last4;
    patch.status = 'unverified';
    patch.last_validation_error = null;
  }
  const updated = await patchRows('ad_account_connections', { id }, patch);
  const parsed = parseRows(connectionDisplaySchema, updated);
  const first = parsed[0];
  if (!first) throw new Error('update ad_account_connections returned no row');
  return first;
}

/** Apaga uma conexão. Escopado por account — cliente_usuario só apaga as suas. */
export async function deleteConnection(scope: AccountScope, id: string): Promise<void> {
  const existing = await getConnectionById(id);
  if (!existing) throw new Error('not_found');
  if (!canManageAccount(scope, existing.account_id)) {
    throw new Error('forbidden: cannot manage this account');
  }
  await deleteRows('ad_account_connections', { id });
}
