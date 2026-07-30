/**
 * Verificação local da UI: /settings deve mostrar "Conectar com Facebook" quando META_APP_ID/SECRET
 * estão no ambiente, e o aviso de "login da Meta desligado" quando não estão. Assina um cookie de
 * sessão com o AUTH_SECRET do .env.local (nunca imprime o valor) e inspeciona o HTML servido.
 *
 * Uso: node scripts/verify-settings-oauth-ui.mjs [baseUrl]
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

// Precisa de uma account real para a página renderizar as listas; usa a primeira do banco.
const rest = async (path) => {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`REST ${res.status} on ${path}`);
  return res.json();
};

const [account] = await rest('accounts?select=id,slug,role&role=eq.super_admin&limit=1');
if (!account) throw new Error('nenhuma account super_admin no banco para o teste');

const session = await new SignJWT({ role: account.role, slug: account.slug })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(account.id)
  .setIssuer('meta-ads-dashboard')
  .setAudience('meta-ads-operator')
  .setIssuedAt()
  .setExpirationTime('600s')
  .sign(new TextEncoder().encode(env.AUTH_SECRET));

const res = await fetch(`${BASE}/settings`, {
  headers: { cookie: `mdash_session=${session}` },
  redirect: 'manual',
});
const html = await res.text();

const checks = [
  ['GET /settings responde 200 com sessão', res.status === 200, String(res.status)],
  ['mostra o botão "Conectar com Facebook"', html.includes('Conectar com Facebook')],
  ['aponta para /api/oauth/meta/start', html.includes('/api/oauth/meta/start')],
  ['não mostra o aviso de OAuth desligado', !html.includes('Login da Meta desligado')],
  ['mantém o fluxo de token manual', html.includes('System User token')],
  ['não vaza META_APP_SECRET no HTML', !html.includes('fake_secret_for_local_test')],
];

let failures = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` → ${detail}` : ''}`);
}
console.log(`\n${checks.length - failures}/${checks.length} checks ok`);
process.exit(failures === 0 ? 0 : 1);
