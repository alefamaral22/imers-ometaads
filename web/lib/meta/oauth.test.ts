import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  META_OAUTH_SCOPES,
  buildAuthorizeUrl,
  classifyCallback,
  exchangeCodeForLongLivedToken,
  fetchMetaUserId,
  openPendingOAuth,
  resolveRedirectUri,
  resolveRequestOrigin,
  sealPendingOAuth,
  signOAuthState,
  verifyOAuthState,
} from './oauth';
import { MetaGraphError } from './graph-shared';

/**
 * ADR 0038 — partes puras do OAuth da Meta. O foco é a FRONTEIRA DE SEGURANÇA: state assinado
 * (anti-CSRF), cookie de staging cifrado (o token nunca legível no browser) e falha fechada.
 */

const AUTH_SECRET = 'x'.repeat(48);
const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555';
const KEY = randomBytes(32);

describe('resolveRedirectUri', () => {
  it('deriva da origem quando não há env explícita', () => {
    expect(resolveRedirectUri('https://app.exemplo.com')).toBe(
      'https://app.exemplo.com/api/oauth/meta/callback',
    );
  });

  it('não duplica barra final da origem', () => {
    expect(resolveRedirectUri('https://app.exemplo.com/')).toBe(
      'https://app.exemplo.com/api/oauth/meta/callback',
    );
  });

  it('a env explícita ganha da origem', () => {
    expect(resolveRedirectUri('https://app.exemplo.com', 'https://outra.com/cb')).toBe(
      'https://outra.com/cb',
    );
  });
});

describe('resolveRequestOrigin (atrás de proxy/túnel)', () => {
  const internal = 'http://localhost:3000/api/oauth/meta/start';

  it('sem headers usa a origem da própria requisição', () => {
    expect(resolveRequestOrigin(internal)).toBe('http://localhost:3000');
  });

  it('x-forwarded-host/proto vencem o host interno', () => {
    expect(
      resolveRequestOrigin(internal, { host: 'meu-tunel.trycloudflare.com', proto: 'https' }),
    ).toBe('https://meu-tunel.trycloudflare.com');
  });

  it('assume https quando o proto não vem (proxies TLS-terminating)', () => {
    expect(resolveRequestOrigin(internal, { host: 'app.exemplo.com' })).toBe(
      'https://app.exemplo.com',
    );
  });

  it('usa o primeiro valor em cadeia de proxies', () => {
    expect(
      resolveRequestOrigin(internal, { host: 'publico.com, interno.local', proto: 'https, http' }),
    ).toBe('https://publico.com');
  });

  it('ignora host malformado e cai no fallback (falha fechada)', () => {
    for (const host of ['evil.com/path', 'a b', 'http://evil.com', '']) {
      expect(resolveRequestOrigin(internal, { host })).toBe('http://localhost:3000');
    }
  });

  it('ignora proto fora de http/https', () => {
    expect(resolveRequestOrigin(internal, { host: 'app.com', proto: 'javascript' })).toBe(
      'https://app.com',
    );
  });

  it('preserva porta explícita no host encaminhado', () => {
    expect(resolveRequestOrigin(internal, { host: 'app.com:8443', proto: 'https' })).toBe(
      'https://app.com:8443',
    );
  });
});

describe('buildAuthorizeUrl — Login para Empresas (config_id)', () => {
  const url = new URL(
    buildAuthorizeUrl({
      appId: '123',
      redirectUri: 'https://a.com/cb',
      state: 'st',
      configId: '999888',
    }),
  );

  it('manda config_id em vez de scope', () => {
    expect(url.searchParams.get('config_id')).toBe('999888');
    expect(url.searchParams.get('scope')).toBeNull();
  });

  it('força response_type=code (senão a Meta devolve token no fragmento)', () => {
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('configId vazio cai no diálogo clássico com escopos', () => {
    const classic = new URL(
      buildAuthorizeUrl({
        appId: '123',
        redirectUri: 'https://a.com/cb',
        state: 'st',
        configId: undefined,
      }),
    );
    expect(classic.searchParams.get('scope')).toBe(META_OAUTH_SCOPES.join(','));
    expect(classic.searchParams.get('config_id')).toBeNull();
  });
});

describe('buildAuthorizeUrl', () => {
  it('monta o diálogo com app id, redirect, state e escopos de ads', () => {
    const url = new URL(
      buildAuthorizeUrl({ appId: '123', redirectUri: 'https://a.com/cb', state: 'st' }),
    );
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.pathname).toContain('/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://a.com/cb');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(META_OAUTH_SCOPES.join(','));
  });
});

describe('state assinado (anti-CSRF)', () => {
  it('ida e volta preserva accountId', async () => {
    const token = await signOAuthState({ accountId: ACCOUNT_ID, nonce: 'n1' }, AUTH_SECRET);
    await expect(verifyOAuthState(token, AUTH_SECRET)).resolves.toEqual({
      accountId: ACCOUNT_ID,
      nonce: 'n1',
    });
  });

  it('recusa state assinado com outro segredo', async () => {
    const token = await signOAuthState({ accountId: ACCOUNT_ID, nonce: 'n1' }, AUTH_SECRET);
    await expect(verifyOAuthState(token, 'y'.repeat(48))).resolves.toBeNull();
  });

  it('recusa state ausente ou lixo', async () => {
    await expect(verifyOAuthState(undefined, AUTH_SECRET)).resolves.toBeNull();
    await expect(verifyOAuthState('not-a-jwt', AUTH_SECRET)).resolves.toBeNull();
  });

  it('recusa accountId que não é uuid', async () => {
    const token = await signOAuthState({ accountId: 'nope', nonce: 'n1' }, AUTH_SECRET);
    await expect(verifyOAuthState(token, AUTH_SECRET)).resolves.toBeNull();
  });
});

describe('cookie de staging cifrado', () => {
  const pending = { token: 't'.repeat(40), userId: '99887766', accountId: ACCOUNT_ID };

  it('abre o que selou', () => {
    expect(openPendingOAuth(sealPendingOAuth(pending, KEY), KEY)).toEqual(pending);
  });

  it('o cookie não expõe o token em texto', () => {
    expect(sealPendingOAuth(pending, KEY)).not.toContain(pending.token);
  });

  it('falha fechada com chave errada, cookie ausente ou adulterado', () => {
    const sealed = sealPendingOAuth(pending, KEY);
    expect(openPendingOAuth(sealed, randomBytes(32))).toBeNull();
    expect(openPendingOAuth(undefined, KEY)).toBeNull();
    expect(openPendingOAuth(`${sealed.slice(0, -4)}AAAA`, KEY)).toBeNull();
  });

  it('recusa payload cifrado com campos inválidos', () => {
    const bad = sealPendingOAuth({ token: 'curto', userId: 'abc', accountId: 'x' } as never, KEY);
    expect(openPendingOAuth(bad, KEY)).toBeNull();
  });
});

describe('classifyCallback', () => {
  it('code + state válidos', () => {
    expect(classifyCallback({ code: 'c', state: 's' })).toEqual({
      kind: 'code',
      code: 'c',
      state: 's',
    });
  });

  it('usuário cancelou → denied', () => {
    expect(classifyCallback({ error: 'access_denied' })).toEqual({ kind: 'denied' });
  });

  it('sem code ou sem state → invalid', () => {
    expect(classifyCallback({ state: 's' })).toEqual({ kind: 'invalid' });
    expect(classifyCallback({ code: 'c' })).toEqual({ kind: 'invalid' });
    expect(classifyCallback({})).toEqual({ kind: 'invalid' });
  });
});

describe('troca de code por long-lived token', () => {
  function fakeFetch(responses: { status: number; body: unknown }[]): typeof fetch {
    let call = 0;
    return (async (url: string) => {
      const res = responses[call++];
      if (!res) throw new Error(`chamada inesperada: ${url}`);
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: async () => JSON.stringify(res.body),
      };
    }) as unknown as typeof fetch;
  }

  const params = {
    appId: '123',
    appSecret: 'secret',
    redirectUri: 'https://a.com/cb',
    code: 'the-code',
  };

  it('faz as duas trocas e devolve o token long-lived', async () => {
    const fetchImpl = fakeFetch([
      { status: 200, body: { access_token: 'short'.repeat(5) } },
      { status: 200, body: { access_token: 'long'.repeat(10) } },
    ]);
    await expect(exchangeCodeForLongLivedToken(params, fetchImpl)).resolves.toBe('long'.repeat(10));
  });

  it('erro HTTP da Meta vira MetaGraphError', async () => {
    const fetchImpl = fakeFetch([{ status: 400, body: { error: { message: 'bad code' } } }]);
    await expect(exchangeCodeForLongLivedToken(params, fetchImpl)).rejects.toBeInstanceOf(
      MetaGraphError,
    );
  });

  it('resposta sem access_token vira MetaGraphError', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: {} }]);
    await expect(exchangeCodeForLongLivedToken(params, fetchImpl)).rejects.toBeInstanceOf(
      MetaGraphError,
    );
  });

  it('fetchMetaUserId valida o formato do id', async () => {
    await expect(
      fetchMetaUserId('tok', fakeFetch([{ status: 200, body: { id: '123' } }])),
    ).resolves.toBe('123');
    await expect(
      fetchMetaUserId('tok', fakeFetch([{ status: 200, body: { id: 'abc' } }])),
    ).rejects.toBeInstanceOf(MetaGraphError);
  });
});
