/**
 * Verificação local do fluxo OAuth da Meta (ADR 0038). Assina um cookie de sessão com o AUTH_SECRET
 * do .env.local (o valor nunca é impresso) e bate nas rotas novas para conferir os contratos:
 * redirect do /start, recusa de state forjado no /callback, staging vazio e 400/409 de validação.
 *
 * Uso: node scripts/verify-meta-oauth.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';

const BASE = process.argv[2] ?? 'http://localhost:3000';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555';

const session = await new SignJWT({ role: 'super_admin', slug: 'verify-script' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(ACCOUNT_ID)
  .setIssuer('meta-ads-dashboard')
  .setAudience('meta-ads-operator')
  .setIssuedAt()
  .setExpirationTime('600s')
  .sign(new TextEncoder().encode(env.AUTH_SECRET));

// Nome do cookie definido em web/lib/auth/domain.ts (SESSION_COOKIE_NAME).
const cookie = `mdash_session=${session}`;

async function hit(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.text().catch(() => '');
  return { status: res.status, location: res.headers.get('location'), body: body.slice(0, 200) };
}

const checks = [];
function check(name, cond, detail) {
  checks.push({ name, ok: Boolean(cond), detail });
}

// 1) /start deve redirecionar para o diálogo da Meta com os escopos de ads e um state assinado.
const start = await hit('/api/oauth/meta/start');
const authorize = start.location ? new URL(start.location) : null;
check(
  'start → 302 para facebook.com/dialog/oauth',
  start.status === 302 && authorize?.hostname === 'www.facebook.com',
  start.location?.slice(0, 80),
);
check(
  'start envia o client_id configurado no env',
  Boolean(env.META_APP_ID) && authorize?.searchParams.get('client_id') === env.META_APP_ID,
  authorize?.searchParams.get('client_id'),
);
// "Login para Empresas" usa config_id (permissões vivem na configuração do painel); o produto
// clássico usa scope. O env decide qual dos dois contratos vale.
if (env.META_LOGIN_CONFIG_ID) {
  check(
    'start envia o config_id do env (Login para Empresas)',
    authorize?.searchParams.get('config_id') === env.META_LOGIN_CONFIG_ID,
    authorize?.searchParams.get('config_id'),
  );
  check(
    'start força response_type=code',
    authorize?.searchParams.get('override_default_response_type') === 'true' &&
      authorize?.searchParams.get('response_type') === 'code',
  );
  check(
    'start não manda scope quando há config_id',
    authorize?.searchParams.get('scope') === null,
    authorize?.searchParams.get('scope'),
  );
} else {
  check(
    'start pede ads_management,ads_read,business_management',
    authorize?.searchParams.get('scope') === 'ads_management,ads_read,business_management',
    authorize?.searchParams.get('scope'),
  );
}
check('start manda state não vazio', (authorize?.searchParams.get('state')?.length ?? 0) > 20);
check(
  'start deriva redirect_uri da origem',
  authorize?.searchParams.get('redirect_uri') === `${BASE}/api/oauth/meta/callback`,
  authorize?.searchParams.get('redirect_uri'),
);

// 2) /start recusa accountId de outra account quando o papel não tem visibilidade global.
const startAlien = await hit('/api/oauth/meta/start?accountId=not-a-uuid');
check('start recusa accountId inválido (400)', startAlien.status === 400, startAlien.body);

// 3) /callback: state forjado/ausente e cancelamento do usuário nunca gravam nada.
const cbForged = await hit('/api/oauth/meta/callback?code=x&state=forjado');
check(
  'callback com state forjado → invalid_state',
  cbForged.location?.includes('meta_oauth=invalid_state'),
  cbForged.location,
);
const cbDenied = await hit('/api/oauth/meta/callback?error=access_denied');
check(
  'callback cancelado → cancelled',
  cbDenied.location?.includes('meta_oauth=cancelled'),
  cbDenied.location,
);
const cbNoCode = await hit('/api/oauth/meta/callback');
check(
  'callback sem code → invalid_state',
  cbNoCode.location?.includes('meta_oauth=invalid_state'),
  cbNoCode.location,
);

// 4) staging vazio: sem cookie pendente a UI recebe pending:false e o finish recusa.
const pending = await hit('/api/data/meta/oauth-pending');
check(
  'oauth-pending sem cookie → pending:false',
  pending.status === 200 && pending.body.includes('"pending":false'),
  pending.body,
);

const finishNoPending = await hit('/api/data/connections/oauth-finish', {
  method: 'POST',
  body: JSON.stringify({ accountId: ACCOUNT_ID, adAccountIds: ['act_123'] }),
});
check('oauth-finish sem autorização → 409', finishNoPending.status === 409, finishNoPending.body);

const finishBad = await hit('/api/data/connections/oauth-finish', {
  method: 'POST',
  body: JSON.stringify({ accountId: 'nope', adAccountIds: [] }),
});
check('oauth-finish com body inválido → 400', finishBad.status === 400, finishBad.body);

const discard = await hit('/api/data/meta/oauth-pending/discard', { method: 'POST' });
check(
  'discard responde ok',
  discard.status === 200 && discard.body.includes('"ok":true'),
  discard.body,
);

// 5) sem sessão: nada é acessível.
const anon = await fetch(`${BASE}/api/oauth/meta/start`, { redirect: 'manual' });
check(
  'start sem sessão → redirect para /login',
  anon.status === 307 || anon.status === 302,
  String(anon.status),
);

let failures = 0;
for (const c of checks) {
  if (!c.ok) failures++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.ok ? ` → ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failures}/${checks.length} checks ok`);
process.exit(failures === 0 ? 0 : 1);
