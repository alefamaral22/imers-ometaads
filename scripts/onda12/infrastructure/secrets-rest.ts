// Onda 12 — Infra REST dos segredos por tenant (ADR 0027). Lê/patcha ad_account_connections e
// api_keys_clientes via REST + SUPABASE_SECRET_KEY (nunca o MCP do Supabase). Decifra o token/keys
// SÓ aqui, no servidor, no instante de uso. Reusa a config/segredo da Onda 2. I/O isolado.

import {
  readSupabaseConfigFromEnv,
  selectRows,
  type SupabaseRestConfig,
} from '../../onda2/infrastructure/supabase-rest.ts';
import { parseKey, decryptSecret, fromPgByteaHex, SecretsError } from '../domain/crypto.ts';
import type { ApiKeyStatus, AccountRole } from '../domain/provider-key.ts';

export { readSupabaseConfigFromEnv };
export type { SupabaseRestConfig };

type FetchLike = typeof fetch;

/** As duas chaves de cripto separadas (ADR 0027). Lança se faltarem — segredo nunca tem default. */
export interface EncKeys {
  adToken: Buffer; // AD_TOKEN_ENC_KEY — cifra tokens Meta
  apiKey: Buffer; // API_KEY_ENC_KEY — cifra keys de provedor
}

export function readEncKeys(env: NodeJS.ProcessEnv = process.env): EncKeys {
  const ad = env.AD_TOKEN_ENC_KEY;
  const api = env.API_KEY_ENC_KEY;
  if (!ad) throw new SecretsError('env.AD_TOKEN_ENC_KEY is required');
  if (!api) throw new SecretsError('env.API_KEY_ENC_KEY is required');
  return { adToken: parseKey(ad), apiKey: parseKey(api) };
}

function headers(cfg: SupabaseRestConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: cfg.secretKey,
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export interface ConnectionRow {
  id: string;
  account_id: string;
  meta_ad_account_id: string;
  access_token_cipher: string | null; // bytea no formato \x… do PostgREST
}

/** Conexões manuais a validar: status vivo (active/unverified) e método manual_token. */
export async function selectConnectionsToValidate(
  cfg: SupabaseRestConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ConnectionRow[]> {
  const rows = await selectRows(
    cfg,
    'ad_account_connections',
    'connection_method=eq.manual_token&status=in.(active,unverified)&select=id,account_id,meta_ad_account_id,access_token_cipher',
    fetchImpl,
  );
  return rows as unknown as ConnectionRow[];
}

/** Decifra o token de uma conexão. Só server-side, no instante de chamar a Meta. */
export function decryptConnectionToken(row: ConnectionRow, keys: EncKeys): string {
  if (!row.access_token_cipher) {
    throw new SecretsError(`connection ${row.id} has no stored token`);
  }
  return decryptSecret(fromPgByteaHex(row.access_token_cipher), keys.adToken);
}

/** PATCH parcial de uma conexão por id (resultado da validação). */
export async function patchConnectionById(
  cfg: SupabaseRestConfig,
  id: string,
  patch: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${cfg.url.replace(/\/+$/, '')}/rest/v1/ad_account_connections?id=eq.${encodeURIComponent(id)}`;
  const res = await fetchImpl(url, {
    method: 'PATCH',
    headers: headers(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`patch ad_account_connections failed (${res.status}): ${await res.text()}`);
  }
}

/** Role da account (decide super_admin vs. tenant pagante na resolução de chave). */
export async function selectAccountRole(
  cfg: SupabaseRestConfig,
  accountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<AccountRole | null> {
  const rows = await selectRows(
    cfg,
    'accounts',
    `id=eq.${encodeURIComponent(accountId)}&select=role`,
    fetchImpl,
  );
  const first = rows[0] as { role?: AccountRole } | undefined;
  return first?.role ?? null;
}

export interface AccountKeyRow {
  provider: string;
  status: ApiKeyStatus;
  key_cipher: string; // \x… do PostgREST
  key_version: number;
}

/** Chaves de provedor de uma account (para o runner resolver/injetar). */
export async function selectAccountKeys(
  cfg: SupabaseRestConfig,
  accountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<AccountKeyRow[]> {
  const rows = await selectRows(
    cfg,
    'api_keys_clientes',
    `account_id=eq.${encodeURIComponent(accountId)}&select=provider,status,key_cipher,key_version`,
    fetchImpl,
  );
  return rows as unknown as AccountKeyRow[];
}

/** Decifra a key de provedor. Só server-side, no instante de lançar o subprocesso da skill. */
export function decryptAccountKey(row: AccountKeyRow, keys: EncKeys): string {
  return decryptSecret(fromPgByteaHex(row.key_cipher), keys.apiKey);
}
