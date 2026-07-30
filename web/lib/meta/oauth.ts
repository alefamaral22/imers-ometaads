import { SignJWT, jwtVerify } from 'jose';
import { encryptSecret, decryptSecret } from '../multitenant/secrets';
import { META_GRAPH_API_VERSION, MetaGraphError } from './graph-shared';

/**
 * ADR 0038 — OAuth oficial da Meta ("Conectar com Facebook") como 2º método de conexão.
 *
 * Este módulo é deliberadamente SEM `server-only` e SEM leitura de `process.env`: recebe tudo por
 * parâmetro para ser puro/testável (URL de autorização, state assinado, cookie de staging cifrado).
 * O I/O com a Meta aceita `fetchImpl` injetável pelo mesmo motivo. Quem resolve env são as rotas.
 *
 * O token em texto puro só existe em memória do handler e dentro do cookie CIFRADO — nunca em JSON
 * de resposta, nunca em log.
 */

/** Escopos necessários para ler e escrever campanhas na conta do cliente (gated por App Review). */
export const META_OAUTH_SCOPES = ['ads_management', 'ads_read', 'business_management'] as const;

export const META_OAUTH_STATE_TTL_SECONDS = 600; // 10 min: tempo de vida do state e do staging
export const META_OAUTH_PENDING_COOKIE = 'meta_oauth_pending';

const STATE_ALG = 'HS256';
const STATE_ISSUER = 'meta-ads-dashboard';
const STATE_AUDIENCE = 'meta-oauth-state';

function secretKey(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

const FORWARDED_HOST_RE = /^[a-z0-9.-]+(:\d+)?$/i;

/**
 * Origem pública da requisição. Atrás de proxy (Vercel, cloudflared) `request.url` carrega o host
 * INTERNO (localhost:3000) — usar isso no `redirect_uri` faz a Meta recusar com "não é possível
 * carregar a URL". Os headers `x-forwarded-host`/`x-forwarded-proto` trazem o host público.
 *
 * Confiança: esses headers são forjáveis por quem fala direto com a app, então o `redirect_uri`
 * derivado NÃO é fronteira de segurança por si só — a Meta valida contra a allowlist do app. Para
 * fixar o valor em produção, use `META_OAUTH_REDIRECT_URI`, que sempre ganha.
 */
export function resolveRequestOrigin(
  requestUrl: string,
  forwarded?: { host?: string | null | undefined; proto?: string | null | undefined },
): string {
  const fallback = new URL(requestUrl).origin;
  // Cadeias de proxy acumulam valores separados por vírgula; o primeiro é o host original.
  const host = forwarded?.host?.split(',')[0]?.trim();
  if (!host || !FORWARDED_HOST_RE.test(host)) return fallback;
  const proto = forwarded?.proto?.split(',')[0]?.trim().toLowerCase();
  const scheme = proto === 'http' || proto === 'https' ? proto : 'https';
  return `${scheme}://${host}`;
}

/** URI de redirect: a env explícita ganha; senão deriva da origem da requisição. */
export function resolveRedirectUri(origin: string, configured?: string | undefined): string {
  if (configured) return configured;
  return `${origin.replace(/\/$/, '')}/api/oauth/meta/callback`;
}

/**
 * Monta a URL do diálogo de autorização da Meta. Puro — coberto por teste.
 *
 * Dois sabores, porque o app do cliente pode ter um ou outro produto habilitado:
 * - "Login do Facebook" (clássico): manda `scope` com os escopos de ads.
 * - "Login do Facebook para Empresas": NÃO aceita `scope`; as permissões vivem numa configuração
 *   criada no painel e referenciada por `config_id`, e é preciso `override_default_response_type`
 *   para receber `code` (senão a Meta devolve token no fragmento).
 * Passar `configId` seleciona o segundo.
 */
export function buildAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
  configId?: string | undefined;
}): string {
  const query = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    state: params.state,
    response_type: 'code',
  });
  if (params.configId) {
    query.set('config_id', params.configId);
    query.set('override_default_response_type', 'true');
  } else {
    query.set('scope', (params.scopes ?? META_OAUTH_SCOPES).join(','));
  }
  return `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?${query.toString()}`;
}

export interface OAuthState {
  accountId: string; // account (tenant) que receberá a conexão
  nonce: string;
}

/**
 * `state` = JWT HS256 assinado com AUTH_SECRET (TTL curto). É a defesa contra CSRF de callback:
 * callback sem state válido é recusado e NADA é gravado.
 */
export async function signOAuthState(state: OAuthState, authSecret: string): Promise<string> {
  return new SignJWT({ accountId: state.accountId, nonce: state.nonce })
    .setProtectedHeader({ alg: STATE_ALG })
    .setIssuer(STATE_ISSUER)
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${META_OAUTH_STATE_TTL_SECONDS}s`)
    .sign(secretKey(authSecret));
}

/** Verifica o state; devolve null se ausente/expirado/forjado/malformado (falha fechada). */
export async function verifyOAuthState(
  token: string | undefined | null,
  authSecret: string,
): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(authSecret), {
      algorithms: [STATE_ALG],
      issuer: STATE_ISSUER,
      audience: STATE_AUDIENCE,
    });
    const accountId = payload.accountId;
    const nonce = payload.nonce;
    if (typeof accountId !== 'string' || typeof nonce !== 'string') return null;
    if (!UUID_RE.test(accountId)) return null;
    return { accountId, nonce };
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staging efêmero entre o callback e a escolha das contas: o token long-lived NÃO é gravado no banco
 * ainda (o usuário pode nem confirmar) e NÃO pode voltar ao browser em texto. Vai num cookie
 * httpOnly com o conteúdo cifrado (AES-256-GCM, AD_TOKEN_ENC_KEY — mesmo formato do cofre).
 */
export interface PendingOAuth {
  token: string; // long-lived user access token
  userId: string; // /me?fields=id → oauth_meta_user_id
  accountId: string;
}

export function sealPendingOAuth(pending: PendingOAuth, key: Buffer): string {
  return encryptSecret(JSON.stringify(pending), key).toString('base64url');
}

/** Abre o cookie de staging. Devolve null para cookie ausente/adulterado/ilegível (falha fechada). */
export function openPendingOAuth(
  cookieValue: string | undefined,
  key: Buffer,
): PendingOAuth | null {
  if (!cookieValue) return null;
  try {
    const plaintext = decryptSecret(Buffer.from(cookieValue, 'base64url'), key);
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== 'object') return null;
    const { token, userId, accountId } = parsed as Record<string, unknown>;
    if (typeof token !== 'string' || token.length < 20) return null;
    if (typeof userId !== 'string' || !/^\d{1,25}$/.test(userId)) return null;
    if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) return null;
    return { token, userId, accountId };
  } catch {
    return null;
  }
}

/** Classificação do retorno do diálogo da Meta (o usuário pode cancelar). Puro. */
export type CallbackOutcome =
  | { kind: 'code'; code: string; state: string }
  | { kind: 'denied' }
  | { kind: 'invalid' };

export function classifyCallback(query: Record<string, string | undefined>): CallbackOutcome {
  if (query.error) {
    // access_denied = usuário clicou "Cancelar"; qualquer outro erro também não é fatal para nós.
    return { kind: 'denied' };
  }
  const { code, state } = query;
  if (typeof code !== 'string' || code.length === 0) return { kind: 'invalid' };
  if (typeof state !== 'string' || state.length === 0) return { kind: 'invalid' };
  return { kind: 'code', code, state };
}

// ── I/O com a Meta ────────────────────────────────────────────────────────────
type FetchLike = typeof fetch;

function graphUrl(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${path}?${query.toString()}`;
}

async function graphJson(
  endpoint: string,
  url: string,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { method: 'GET' });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new MetaGraphError(
      endpoint,
      res.status,
      `Meta OAuth ${res.status} on ${endpoint}: ${text.slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new MetaGraphError(endpoint, res.status, `Meta OAuth ${endpoint}: resposta não-JSON`);
  }
}

function readAccessToken(endpoint: string, json: Record<string, unknown>): string {
  const token = json.access_token;
  if (typeof token !== 'string' || token.length < 20) {
    throw new MetaGraphError(endpoint, 200, `Meta OAuth ${endpoint}: access_token ausente`);
  }
  return token;
}

/**
 * Troca `code` → token de curta duração e, em seguida, → long-lived (~60 dias) via
 * `grant_type=fb_exchange_token`. Feito no callback porque o token curto expira em ~1h.
 */
export async function exchangeCodeForLongLivedToken(
  params: { appId: string; appSecret: string; redirectUri: string; code: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const shortLived = readAccessToken(
    'oauth_access_token',
    await graphJson(
      'oauth_access_token',
      graphUrl('oauth/access_token', {
        client_id: params.appId,
        client_secret: params.appSecret,
        redirect_uri: params.redirectUri,
        code: params.code,
      }),
      fetchImpl,
    ),
  );
  return readAccessToken(
    'oauth_exchange_token',
    await graphJson(
      'oauth_exchange_token',
      graphUrl('oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: params.appId,
        client_secret: params.appSecret,
        fb_exchange_token: shortLived,
      }),
      fetchImpl,
    ),
  );
}

/** Lê o id do usuário Meta autorizador (guardado em `oauth_meta_user_id`). */
export async function fetchMetaUserId(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const json = await graphJson(
    'me',
    graphUrl('me', { fields: 'id', access_token: token }),
    fetchImpl,
  );
  const id = json.id;
  if (typeof id !== 'string' || !/^\d{1,25}$/.test(id)) {
    throw new MetaGraphError('me', 200, 'Meta OAuth me: id ausente ou inválido');
  }
  return id;
}
